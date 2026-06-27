import { NextResponse } from 'next/server';
import { Types } from 'mongoose';

import { getSession } from '@/lib/get-session';
import { dbConnect } from '@/lib/db/connect';
import { userRepository } from '@/lib/db/repository/user.repository';
import InboxConversation from '@/lib/db/models/inbox-conversation.model';
import WhatsAppCampaign from '@/lib/db/models/whatsapp-campaign.model';
import PendingAgentAction from '@/lib/db/models/pending-agent-action.model';

/**
 * GET /api/v2/navigation/counts
 *
 * Cheap counts map for the shell SubNav badges (`badgeKey` → count). Every
 * count is a single indexed `countDocuments`, run in parallel, scoped to the
 * org read from the session user's DB record (never a client-supplied value).
 *
 * Keys returned:
 *   - inboxOpen          open inbox conversations (org-wide)
 *   - agentApprovals     pending agent approvals for THIS user (incl. delegated)
 *   - whatsappActive     in-flight WhatsApp campaigns (scheduled/processing/running)
 *
 * The SubNav hides any badge whose count is 0 or missing.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    const userId = session.user.id;
    const user = await userRepository.findById(userId);
    // Org scope comes from the user's DB record, never from the client.
    const organizationId = user!.id;
    const orgObjectId = new Types.ObjectId(String(organizationId));

    const [inboxOpen, agentApprovals, whatsappActive] = await Promise.all([
      // Open conversations — uses { organizationId, status, priority } index.
      InboxConversation.countDocuments({ status: 'open' }).exec(),
      // Pending approvals for this user (incl. delegated) — uses { userId, status } index.
      PendingAgentAction.countDocuments({
        $or: [{ userId }, { delegatedTo: userId }],
        status: 'pending',
      }).exec(),
      // In-flight WhatsApp campaigns — uses { organizationId, status } index.
      WhatsAppCampaign.countDocuments({
        status: { $in: ['scheduled', 'processing', 'running'] },
      }).exec(),
    ]);

    return NextResponse.json({
      counts: {
        inboxOpen,
        agentApprovals,
        whatsappActive,
      },
    });
  } catch (error) {
    console.error('Error fetching navigation counts:', error);
    return NextResponse.json({ error: 'Failed to fetch navigation counts' }, { status: 500 });
  }
}
