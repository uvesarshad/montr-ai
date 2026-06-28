import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import {
    ensureCapabilityRegistry,
    type CapabilityFilter,
    type CapabilityKind,
    type CapabilitySource,
} from '@/lib/registry';

const KINDS: CapabilityKind[] = ['tool', 'mission', 'playbook'];
const SOURCES: CapabilitySource[] = ['core', 'community', 'overlay'];

/**
 * GET /api/v2/registry
 *
 * Lists Capability-Hub descriptors (tools, missions, playbooks) — the seam a
 * future marketplace reads from. Supports `?kind=`, `?source=`, `?publishable=`,
 * and `?search=` filters.
 */
export async function GET(request: NextRequest) {
    const session = await getSession();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const registry = ensureCapabilityRegistry();
    const { searchParams } = new URL(request.url);

    const filter: CapabilityFilter = {};
    const kind = searchParams.get('kind');
    if (kind && KINDS.includes(kind as CapabilityKind)) filter.kind = kind as CapabilityKind;
    const source = searchParams.get('source');
    if (source && SOURCES.includes(source as CapabilitySource)) filter.source = source as CapabilitySource;
    const publishable = searchParams.get('publishable');
    if (publishable === 'true') filter.publishable = true;
    if (publishable === 'false') filter.publishable = false;
    const search = searchParams.get('search');
    if (search) filter.search = search;

    const capabilities = registry.list(filter);

    return NextResponse.json({
        capabilities,
        total: capabilities.length,
        counts: {
            tool: registry.count({ kind: 'tool' }),
            mission: registry.count({ kind: 'mission' }),
            playbook: registry.count({ kind: 'playbook' }),
            publishable: registry.count({ publishable: true }),
        },
    });
}
