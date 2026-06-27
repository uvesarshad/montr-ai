/**
 * AiBot — first-class cross-channel conversational bot entity (B3-4.5.5).
 *
 * Single bot identity that can be assigned to WhatsApp accounts, inbox channels,
 * and voice phone numbers. Replaces the per-WhatsApp keyword auto-reply path as
 * the canonical "bot brain" backing a customer-facing conversation.
 *
 * Composition: voice + personality + style + visual references live on an
 * AiCharacter (B2-3.13). AiBot references one via `aiCharacterId` and owns the
 * operational config: which channels, which KBs, escalation rules, system prompt.
 *
 * Distinction from Bundle 1 multi-agent system: AiBot is customer-facing.
 * Agents (B1) are internal operators that drive the platform on behalf of the user.
 * Do not consolidate.
 */

import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export type AiBotChannel = 'whatsapp' | 'inbox' | 'voice';

export interface IAiBotEscalationRules {
  /** Inbound messages containing any of these phrases trigger escalation. */
  keywords?: string[];
  /** If the LLM calls this tool name, treat it as an escalation request. */
  toolName?: string;
  /** After N turns without resolution, escalate automatically. */
  autoEscalateAfterTurns?: number;
  /** User to assign on escalation. If unset, conversation goes to queue (assignedToId=null). */
  defaultAssigneeId?: Types.ObjectId | string;
  /** When true, do not post a system message to the customer on escalation. */
  silentEscalation?: boolean;
}

export interface IAiBotRoutingDefaults {
  /** Re-engage the bot N ms after the human closes the conversation. */
  onCloseReengageAfterMs?: number;
  /** Hard cap on tool-call iterations per turn (default 6). */
  maxToolCallsPerTurn?: number;
  /** If true, fire an opening message when `assign_ai_bot_to_conversation` runs. */
  greetOnAssign?: boolean;
}

export interface IAiBot extends Document {
  /** Optional brand scope. Null = available across all brands in the org. */
  brandId?: Types.ObjectId | null;
  createdById: Types.ObjectId;

  name: string;
  description?: string;

  /** AiCharacter that supplies voice (for voice channel), personality, style. */
  aiCharacterId?: Types.ObjectId | null;

  /** LLM system prompt. Prepended with character's personality/styleDescriptors at runtime. */
  systemPrompt: string;

  /** KnowledgeBase docs auto-injected via searchKnowledgeBase tool. */
  knowledgeBaseIds: Types.ObjectId[];

  /** Channels this bot may be deployed on. */
  enabledChannels: AiBotChannel[];

  escalationRules?: IAiBotEscalationRules;
  routingDefaults?: IAiBotRoutingDefaults;

  /** LLM model id override (e.g. 'claude-haiku-4-5-20251001'). Falls through to router defaults if unset. */
  llmModel?: string;
  temperature?: number;

  status: 'active' | 'archived';
  /** How many times runAiBotTurn has been invoked for this bot. Telemetry. */
  usageCount: number;

  createdAt: Date;
  updatedAt: Date;
}

const EscalationRulesSchema = new Schema<IAiBotEscalationRules>(
  {
    keywords: { type: [String], default: undefined },
    toolName: String,
    autoEscalateAfterTurns: { type: Number, min: 1 },
    defaultAssigneeId: { type: Schema.Types.ObjectId, ref: 'User' },
    silentEscalation: { type: Boolean, default: false },
  },
  { _id: false },
);

const RoutingDefaultsSchema = new Schema<IAiBotRoutingDefaults>(
  {
    onCloseReengageAfterMs: { type: Number, min: 0 },
    maxToolCallsPerTurn: { type: Number, min: 1, max: 20, default: 6 },
    greetOnAssign: { type: Boolean, default: true },
  },
  { _id: false },
);

const AiBotSchema = new Schema<IAiBot>(
  {
    brandId: { type: Schema.Types.ObjectId, ref: 'Brand', default: null, index: true },
    createdById: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 1000 },

    aiCharacterId: { type: Schema.Types.ObjectId, ref: 'AiCharacter', default: null },

    systemPrompt: { type: String, required: true },

    knowledgeBaseIds: [{ type: Schema.Types.ObjectId, ref: 'KnowledgeBase' }],

    enabledChannels: {
      type: [String],
      enum: ['whatsapp', 'inbox', 'voice'],
      default: [],
    },

    escalationRules: { type: EscalationRulesSchema, required: false },
    routingDefaults: { type: RoutingDefaultsSchema, required: false },

    llmModel: String,
    temperature: { type: Number, min: 0, max: 2 },

    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active',
      index: true,
    },
    usageCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    collection: 'ai_bots',
  },
);

AiBotSchema.index({ brandId: 1, status: 1 });
AiBotSchema.index({ updatedAt: -1 });
AiBotSchema.index({ aiCharacterId: 1 }, { sparse: true });

if (process.env.NODE_ENV === 'development') {
  if (mongoose.models.AiBot) {
    delete mongoose.models.AiBot;
  }
}

export const AiBot: Model<IAiBot> =
  mongoose.models.AiBot || mongoose.model<IAiBot>('AiBot', AiBotSchema);

export default AiBot;
