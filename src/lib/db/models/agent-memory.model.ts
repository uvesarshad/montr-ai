/**
 * B1-3.4 — Agent brand-scoped memory.
 *
 * A simple key→value scratchpad shared across all missions for a given brand.
 * Agents can read/write arbitrary facts (e.g. "last_campaign_theme", "target_persona")
 * without polluting the conversation history.
 *
 * Schema intentionally minimal — values are free-form strings (JSON-serialisable).
 * TTL is optional; a null expiresAt means the entry persists indefinitely.
 */

import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IAgentMemory extends Document {
  brandId: string;
  key: string;
  value: string;
  /** Optional free-text note about what this memory is for. */
  description?: string;
  /** When set, the entry will be automatically deleted by MongoDB TTL index. */
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AgentMemorySchema = new Schema<IAgentMemory>(
  {
    brandId: { type: String, required: true },
    key: { type: String, required: true, trim: true },
    value: { type: String, required: true },
    description: { type: String, default: null },
    expiresAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: 'agent_memories',
  }
);

// Primary lookup: org + brand + key (unique — one value per key per brand).
AgentMemorySchema.index(
  { brandId: 1, key: 1 },
  { unique: true }
);

// List all memories for a brand.
AgentMemorySchema.index({ brandId: 1, updatedAt: -1 });

// TTL index — MongoDB removes documents once expiresAt passes.
AgentMemorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });

const AgentMemory: Model<IAgentMemory> =
  mongoose.models.AgentMemory ||
  mongoose.model<IAgentMemory>('AgentMemory', AgentMemorySchema);

export default AgentMemory;
