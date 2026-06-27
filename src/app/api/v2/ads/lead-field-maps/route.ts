import { getSession } from '@/lib/get-session';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adLeadFieldMapRepository } from '@/lib/db/repository/ad-lead-field-map.repository';

const upsertSchema = z.object({
    platform: z.enum(['google_ads', 'meta_ads']),
    formId: z.string().trim().min(1).max(200),
    fieldMap: z.object({
        firstName: z.string().trim().max(200).optional(),
        lastName: z.string().trim().max(200).optional(),
        email: z.string().trim().max(200).optional(),
        phone: z.string().trim().max(200).optional(),
    }),
});

async function resolveOrg() {
    const session = await getSession();
    if (!session?.user?.id) return { error: 'Unauthorized', status: 401 as const };
    return { };
}

/**
 * Lists the org's per-form lead field mappings.
 * GET /api/v2/ads/lead-field-maps
 */
export async function GET() {
    try {
        const resolved = await resolveOrg();
        if ('error' in resolved) {
            return NextResponse.json({ error: resolved.error }, { status: resolved.status });
        }

        const maps = await adLeadFieldMapRepository.listByOrganization();
        return NextResponse.json({
            maps: maps.map((map) => ({
                platform: map.platform,
                formId: map.formId,
                fieldMap: map.fieldMap,
            })),
        });
    } catch (error) {
        console.error('Error listing lead field maps:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

/**
 * Creates/updates the mapping for one form.
 * PUT /api/v2/ads/lead-field-maps  { platform, formId, fieldMap }
 */
export async function PUT(req: NextRequest) {
    try {
        const resolved = await resolveOrg();
        if ('error' in resolved) {
            return NextResponse.json({ error: resolved.error }, { status: resolved.status });
        }

        const parsed = upsertSchema.safeParse(await req.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message || 'Invalid request' },
                { status: 400 },
            );
        }

        const { platform, formId, fieldMap } = parsed.data;
        const saved = await adLeadFieldMapRepository.upsert(platform, formId, fieldMap);

        return NextResponse.json({
            platform: saved.platform,
            formId: saved.formId,
            fieldMap: saved.fieldMap,
        });
    } catch (error) {
        console.error('Error saving lead field map:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
