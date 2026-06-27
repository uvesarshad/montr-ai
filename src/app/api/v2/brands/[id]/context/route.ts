import { NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { dbConnect } from '@/lib/db/connect';
import BrandContext from '@/lib/db/models/brand-context.model';
import Brand from '@/lib/db/models/brand.model';

/**
 * GET /api/v2/brands/[id]/context
 * Get the AI persona / brand context for a brand.
 * Creates a default context if none exists.
 */
export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { id: brandId } = await params;
        await dbConnect();

        // Verify brand ownership
        const brand = await Brand.findById(brandId);
        if (!brand || brand.userId !== session.user.id) {
            return new NextResponse('Brand not found', { status: 404 });
        }

        // Find or create default context
        let context = await BrandContext.findOne({ brandId });

        if (!context) {
            context = await BrandContext.create({
                brandId,
                agentName: `${brand.name} Agent`,
            });
        }

        return NextResponse.json(context);
    } catch (error) {
        console.error('Error fetching brand context:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

/**
 * PUT /api/v2/brands/[id]/context
 * Update the AI persona / brand context for a brand.
 */
export async function PUT(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { id: brandId } = await params;
        const body = await req.json();
        await dbConnect();

        // Verify brand ownership
        const brand = await Brand.findById(brandId);
        if (!brand || brand.userId !== session.user.id) {
            return new NextResponse('Brand not found', { status: 404 });
        }

        // Whitelist allowed fields to update
        const allowedFields = [
            'agentName', 'personality', 'tone', 'languageStyle', 'customInstructions',
            'brandVoice', 'targetAudience', 'competitors', 'keyMessages', 'industry',
            'enabledTools', 'requireApproval', 'maxBudgetPerSession'
        ];

        const updateData: Record<string, unknown> = {};
        for (const field of allowedFields) {
            if (body[field] !== undefined) {
                updateData[field] = body[field];
            }
        }

        // Voice call policy (D4 2026-06-05) — validated shape, not pass-through.
        if (body.voiceCallPolicy !== undefined) {
            const vp = body.voiceCallPolicy as { mode?: string; conditions?: Record<string, unknown> } | null;
            const validModes = ['always_ask', 'always_autonomous', 'conditional'];
            if (vp && validModes.includes(String(vp.mode))) {
                const cond = vp.conditions ?? {};
                updateData.voiceCallPolicy = {
                    mode: vp.mode,
                    conditions: {
                        autonomousPurposes: Array.isArray(cond.autonomousPurposes)
                            ? (cond.autonomousPurposes as unknown[]).map(String).slice(0, 10)
                            : [],
                        knownContactsOnly: cond.knownContactsOnly !== false,
                        businessHoursOnly: cond.businessHoursOnly !== false,
                    },
                };
            } else if (vp === null) {
                updateData.voiceCallPolicy = undefined;
            }
        }

        const context = await BrandContext.findOneAndUpdate(
            { brandId },
            { $set: updateData },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        return NextResponse.json(context);
    } catch (error) {
        console.error('Error updating brand context:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
