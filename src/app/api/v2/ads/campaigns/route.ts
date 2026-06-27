import { getSession } from '@/lib/get-session';
import { NextRequest, NextResponse } from 'next/server';
import { adsCampaignCreateSchema } from '@/validations/ads-campaign';
import { createCampaignFromSpec } from '@/lib/ads/campaign-creation';

/**
 * Creates a campaign (always PAUSED) from the wizard spec.
 * POST /api/v2/ads/campaigns
 *
 * GUARDRAIL: this route is the only entry point to the ads write-ops
 * allowlist, and it only ever runs as the direct result of the user
 * pressing "Create" on the wizard review step. The campaign never spends
 * until the user activates it in the native platform UI.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const parsed = adsCampaignCreateSchema.safeParse(await req.json().catch(() => null));
        if (!parsed.success) {
            const issue = parsed.error.issues[0];
            return NextResponse.json(
                { error: issue ? `${issue.path.join('.')}: ${issue.message}` : 'Invalid request' },
                { status: 400 },
            );
        }

        const result = await createCampaignFromSpec({
            userId: session.user.id!,
            spec: parsed.data,
        });

        return NextResponse.json(result, { status: result.status === 'created' ? 201 : 207 });
    } catch (error) {
        console.error('Campaign creation error:', error);
        const message = error instanceof Error ? error.message : 'Internal Server Error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
