import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { contactRepository } from '@/lib/db/repository/crm/contact.repository';
import { fetchUnifiedTimeline } from '@/lib/crm/unified-timeline';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';

/**
 * GET /api/v2/crm/contacts/[id]/unified-timeline
 *
 * Returns a chronological stream of every event touching this contact across
 * activities, 1:1 emails, WhatsApp, and the omnichannel inbox. See
 * `src/lib/crm/unified-timeline.ts` for the full source list and TODOs for
 * voice, social, and form-submission integration.
 *
 * Query params:
 *  - limit: max events (default 25, capped at 100)
 *  - before: ISO timestamp for cursor pagination
 */
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await userRepository.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: 'No organization' }, { status: 403 });
    }
    assertCrmPermission(await getCrmPermissionContext(session.user.id), 'contact', 'read');

    const contact = await contactRepository.findById(params.id);
    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '25', 10) || 25, 100);
    const before = searchParams.get('before') || undefined;

    const result = await fetchUnifiedTimeline({
      contactId: params.id,
      limit,
      before,
    });

    return NextResponse.json(result);
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching unified timeline:', error);
    return NextResponse.json(
      { error: 'Failed to fetch unified timeline', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
