/**
 * AiBotConversationState repository.
 *
 * Manages per-conversation memory the bot runtime reads on each turn.
 * `appendTurn` enforces the FIFO cap and triggers summarization on overflow.
 */

import mongoose, { Types } from 'mongoose';

import AiBotConversationState, {
  IAiBotConversationState,
  IAiBotTurn,
} from '../models/ai-bot-conversation-state.model';
import type { AiBotChannel } from '../models/ai-bot.model';

const DEFAULT_TURN_CAP = 20;

export interface FindOrCreateOptions {
  brandId?: string | Types.ObjectId | null;
  aiBotId: string | Types.ObjectId;
  channel: AiBotChannel;
  conversationId: string | Types.ObjectId;
  contactId?: string | Types.ObjectId | null;
}

export interface AppendTurnOptions {
  cap?: number;
  /** Async summarizer invoked when the FIFO cap is exceeded. */
  summarize?: (overflowTurns: IAiBotTurn[], existingSummary?: string) => Promise<string>;
}

class AiBotConversationStateRepository {
  private async ensureConnection(): Promise<void> {
    if (mongoose.connection.readyState !== 1) {
      const { connectMongoose } = await import('@/lib/mongodb');
      await connectMongoose();
    }
  }

  async findOrCreate(opts: FindOrCreateOptions): Promise<IAiBotConversationState> {
    await this.ensureConnection();
    const existing = await AiBotConversationState.findOne({
      aiBotId: opts.aiBotId,
      conversationId: opts.conversationId,
    }).exec();
    if (existing) return existing;

    return AiBotConversationState.create({
      brandId: opts.brandId ?? null,
      aiBotId: opts.aiBotId,
      channel: opts.channel,
      conversationId: opts.conversationId,
      contactId: opts.contactId ?? null,
      lastTurns: [],
      turnCount: 0,
      lastTurnAt: new Date(),
      escalationRequested: false,
    });
  }

  async findByConversation(
    aiBotId: string | Types.ObjectId,
    conversationId: string | Types.ObjectId,
  ): Promise<IAiBotConversationState | null> {
    await this.ensureConnection();
    return AiBotConversationState.findOne({ aiBotId, conversationId }).exec();
  }

  async appendTurn(
    stateId: string | Types.ObjectId,
    turn: IAiBotTurn,
    opts: AppendTurnOptions = {},
  ): Promise<IAiBotConversationState | null> {
    await this.ensureConnection();
    const cap = opts.cap ?? DEFAULT_TURN_CAP;

    const state = await AiBotConversationState.findById(stateId).exec();
    if (!state) return null;

    state.lastTurns.push(turn);
    state.turnCount += 1;
    state.lastTurnAt = turn.ts;

    if (state.lastTurns.length > cap) {
      const overflow = state.lastTurns.slice(0, state.lastTurns.length - cap);
      state.lastTurns = state.lastTurns.slice(-cap);

      if (opts.summarize) {
        try {
          state.summary = await opts.summarize(overflow, state.summary);
        } catch (err) {
          console.error('[ai-bot-state] summarize failed; keeping prior summary:', err);
        }
      }
    }

    await state.save();
    return state;
  }

  async setIntent(
    stateId: string | Types.ObjectId,
    intent: string,
  ): Promise<void> {
    await this.ensureConnection();
    await AiBotConversationState.updateOne(
      { _id: stateId },
      { $set: { currentIntent: intent } },
    ).exec();
  }

  async markEscalated(
    stateId: string | Types.ObjectId,
    reason?: string,
  ): Promise<void> {
    await this.ensureConnection();
    await AiBotConversationState.updateOne(
      { _id: stateId },
      { $set: { escalationRequested: true, escalationReason: reason } },
    ).exec();
  }

  async clear(stateId: string | Types.ObjectId): Promise<void> {
    await this.ensureConnection();
    await AiBotConversationState.findByIdAndDelete(stateId).exec();
  }
}

export const aiBotConversationStateRepository =
  new AiBotConversationStateRepository();
export { AiBotConversationStateRepository };
