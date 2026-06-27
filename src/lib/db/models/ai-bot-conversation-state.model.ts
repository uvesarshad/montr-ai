/**
 * AiBotConversationState — per-conversation memory for an AI bot turn.
 *
 * One row per (aiBotId, conversationId) where conversationId is polymorphic
 * across channels (inbox_conversation._id / whatsapp_conversation._id / call_session._id).
 *
 * The runtime reads this on each turn to compose the LLM message list:
 *   [system prompt] + [rolling summary?] + [lastTurns] + [new inbound]
 *
 * `lastTurns` is FIFO-capped (default 20). When it overflows, the runtime
 * writes a rolling summary into `summary` and drops the oldest turns.
 */

import mongoose, { Schema, Document, Model, Types } from 'mongoose';

import type { AiBotChannel } from './ai-bot.model';

export type AiBotTurnRole = 'user' | 'assistant' | 'tool';

export interface IAiBotTurn {
  role: AiBotTurnRole;
  content: string;
  ts: Date;
  /** For role=tool: which tool produced this output. */
  toolName?: string;
}

export interface IAiBotConversationState extends Document {
  brandId?: Types.ObjectId | null;

  aiBotId: Types.ObjectId;
  channel: AiBotChannel;
  /** Polymorphic — refs inbox_conversation / whatsapp_conversation / call_session. */
  conversationId: Types.ObjectId;
  contactId?: Types.ObjectId | null;

  /** FIFO-capped recent turns. */
  lastTurns: IAiBotTurn[];
  /** Rolling summary written when lastTurns overflows. */
  summary?: string;
  /** Free-form intent the bot has set for this conversation. */
  currentIntent?: string;

  turnCount: number;
  lastTurnAt: Date;

  escalationRequested: boolean;
  escalationReason?: string;

  createdAt: Date;
  updatedAt: Date;
}

const TurnSchema = new Schema<IAiBotTurn>(
  {
    role: { type: String, enum: ['user', 'assistant', 'tool'], required: true },
    content: { type: String, required: true },
    ts: { type: Date, default: () => new Date(), required: true },
    toolName: String,
  },
  { _id: false },
);

const AiBotConversationStateSchema = new Schema<IAiBotConversationState>(
  {
    brandId: { type: Schema.Types.ObjectId, ref: 'Brand', default: null, index: true },

    aiBotId: { type: Schema.Types.ObjectId, ref: 'AiBot', required: true },
    channel: {
      type: String,
      enum: ['whatsapp', 'inbox', 'voice'],
      required: true,
    },
    conversationId: { type: Schema.Types.ObjectId, required: true },
    contactId: { type: Schema.Types.ObjectId, ref: 'CrmContact', default: null },

    lastTurns: { type: [TurnSchema], default: [] },
    summary: String,
    currentIntent: String,

    turnCount: { type: Number, default: 0 },
    lastTurnAt: { type: Date, default: () => new Date() },

    escalationRequested: { type: Boolean, default: false },
    escalationReason: String,
  },
  {
    timestamps: true,
    collection: 'ai_bot_conversation_states',
  },
);

AiBotConversationStateSchema.index(
  { aiBotId: 1, conversationId: 1 },
  { unique: true, name: 'ai_bot_state_bot_conversation_unique' },
);
AiBotConversationStateSchema.index({ channel: 1, lastTurnAt: -1 });

if (process.env.NODE_ENV === 'development') {
  if (mongoose.models.AiBotConversationState) {
    delete mongoose.models.AiBotConversationState;
  }
}

export const AiBotConversationState: Model<IAiBotConversationState> =
  mongoose.models.AiBotConversationState ||
  mongoose.model<IAiBotConversationState>(
    'AiBotConversationState',
    AiBotConversationStateSchema,
  );

export default AiBotConversationState;
