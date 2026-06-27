/**
 * Single source of truth for "should the bot stay silent on this conversation?".
 *
 * Returns true when a human has claimed the conversation (assignedToId set).
 * Used by WhatsApp webhook, inbox ingest, and voice WS handler so the
 * three channels enforce the same handoff invariant.
 *
 * B3-4.5.7 suppression-side already exists in the WhatsApp webhook; this
 * helper extracts the check so all channels match.
 */

import type { Types } from 'mongoose';

export interface SuppressionInput {
  assignedToId?: Types.ObjectId | string | null;
  status?: 'open' | 'pending' | 'resolved' | 'closed';
}

export function shouldSuppress(conversation: SuppressionInput | null | undefined): boolean {
  if (!conversation) return true;
  if (conversation.status === 'closed') return true;
  return !!conversation.assignedToId;
}
