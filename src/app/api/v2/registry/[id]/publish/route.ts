import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/get-session';
import { ensureCapabilityRegistry } from '@/lib/registry';

const bodySchema = z.object({
    publishable: z.boolean().optional().default(true),
});

/**
 * POST /api/v2/registry/[id]/publish
 *
 * Marks a capability publishable (body `{ publishable: false }` un-marks it) —
 * the seam's write surface for a future marketplace publish flow. Admin-gated.
 * `id` is the namespaced capability id, e.g. "tool:createContact" (URL-encoded).
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await getSession();
    const role = (session?.user as { role?: string } | undefined)?.role;
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (role !== 'admin' && role !== 'super_admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const capabilityId = decodeURIComponent(id);

    let publishable = true;
    try {
        const raw = await request.json().catch(() => ({}));
        publishable = bodySchema.parse(raw).publishable;
    } catch (error) {
        return NextResponse.json({ error: 'Invalid body', details: String(error) }, { status: 400 });
    }

    const registry = ensureCapabilityRegistry();
    const updated = registry.markPublishable(capabilityId, publishable);
    if (!updated) {
        return NextResponse.json({ error: 'Capability not found', id: capabilityId }, { status: 404 });
    }

    return NextResponse.json({ capability: updated });
}
