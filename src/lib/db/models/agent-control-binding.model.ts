/**
 * Agent Control Binding (G12, 2026-06-05)
 *
 * Binds an owner's personal WhatsApp phone to their MontrAI user so they can
 * drive the agent over WhatsApp (status / approve / reject / goal). The
 * binding IS the security boundary: webhook traffic is identified only by
 * phone number, so activation requires a code pairing initiated from the
 * authenticated web app, and every command is scoped to the bound user's own
 * data and audited.
 *
 * Pairing flow (session-safe — avoids Meta's business-initiated templates):
 *   web app generates a 6-digit code (hash stored, 10-min expiry, 3 attempts)
 *   → user sends "PAIR <code>" from their phone to the brand's WhatsApp
 *   number → webhook verifies → status 'active'.
 */

import mongoose, { Document, Model, Schema } from 'mongoose';

export type AgentControlBindingStatus = 'pending' | 'active' | 'revoked';

export interface AgentControlApprovalMapEntry {
  index: number;
  actionId: string;
}

export interface IAgentControlBinding extends Document {
  userId: string;
  brandId?: string | null;
  /** The brand WhatsApp account (whatsapp_accounts) used to converse with the owner. */
  whatsappAccountId: string;
  /** Owner's phone, digits only (E.164 without '+') — matches Meta webhook `from`. */
  phone: string;
  status: AgentControlBindingStatus;

  // Pairing
  pairingCodeHash?: string | null;
  pairingExpiresAt?: Date | null;
  pairingAttempts: number;

  // approve/reject numbering from the last `status` reply
  approvalMap: AgentControlApprovalMapEntry[];
  approvalMapExpiresAt?: Date | null;

  // Rate limiting (20 commands/hour)
  windowStart?: Date | null;
  windowCount: number;

  pairedAt?: Date | null;
  lastUsedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const AgentControlBindingSchema = new Schema<IAgentControlBinding>(
  {
    userId: { type: String, required: true, index: true },
    brandId: { type: String, default: null },
    whatsappAccountId: { type: String, required: true },
    phone: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'active', 'revoked'],
      default: 'pending',
      index: true,
    },
    pairingCodeHash: { type: String, default: null },
    pairingExpiresAt: { type: Date, default: null },
    pairingAttempts: { type: Number, default: 0 },
    approvalMap: {
      type: [
        {
          index: { type: Number, required: true },
          actionId: { type: String, required: true },
        },
      ],
      default: [],
    },
    approvalMapExpiresAt: { type: Date, default: null },
    windowStart: { type: Date, default: null },
    windowCount: { type: Number, default: 0 },
    pairedAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: 'agent_control_bindings',
  },
);

// One binding per phone per org; lookups by phone on every inbound message.
AgentControlBindingSchema.index({ phone: 1 }, { unique: true });
AgentControlBindingSchema.index({ phone: 1, status: 1 });

const AgentControlBinding: Model<IAgentControlBinding> =
  mongoose.models.AgentControlBinding ||
  mongoose.model<IAgentControlBinding>('AgentControlBinding', AgentControlBindingSchema);

export default AgentControlBinding;
