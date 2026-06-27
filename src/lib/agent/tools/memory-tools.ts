/**
 * B1-3.4 — Agent brand-scoped memory tools.
 *
 * read_memory / write_memory / delete_memory / list_memory_keys
 * All entries are keyed by (brandId, key) and are shared across missions.
 */

import { z } from 'zod';
import { tool } from 'ai';
import { toolRegistry } from '../tool-registry';
import { AgentContext } from './types';
import { dbConnect } from '@/lib/db/connect';
import AgentMemory from '@/lib/db/models/agent-memory.model';

// ─── read_memory ─────────────────────────────────────────────────────────────

export const readMemoryTool = {
  name: 'read_memory',
  description:
    'Read a brand-scoped memory value by key. ' +
    'Use this to recall facts the agent previously stored (e.g. "target_persona", "last_campaign_theme").',
  parameters: z.object({
    key: z.string().min(1).max(100).describe('The memory key to look up.'),
  }),
  factory: (context: AgentContext) =>
    tool({
      description: 'Read a brand memory entry.',
      parameters: z.object({ key: z.string().min(1).max(100) }),
      execute: async (args) => {
        try {
          await dbConnect();
          const entry = await AgentMemory.findOne({
            brandId: context.brandId || '',
            key: args.key,
          }).lean();
          if (!entry) return { found: false, key: args.key, value: null };
          return { found: true, key: entry.key, value: entry.value, description: entry.description ?? null };
        } catch (error) {
          return { found: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
    }),
};

// ─── write_memory ─────────────────────────────────────────────────────────────

export const writeMemoryTool = {
  name: 'write_memory',
  description:
    'Store or update a brand-scoped memory value by key. ' +
    'Use this to persist facts across missions (e.g. preferred tone, active promotion, target audience).',
  parameters: z.object({
    key: z.string().min(1).max(100).describe('Short, descriptive key (snake_case recommended).'),
    value: z.string().min(1).max(2000).describe('Value to store. May be plain text or serialised JSON.'),
    description: z
      .string()
      .max(200)
      .optional()
      .describe('Human-readable note about what this memory holds.'),
    ttlHours: z
      .number()
      .int()
      .min(1)
      .max(8760)
      .optional()
      .describe('Optional TTL in hours. Omit for permanent storage.'),
  }),
  factory: (context: AgentContext) =>
    tool({
      description: 'Write a brand memory entry.',
      parameters: z.object({
        key: z.string().min(1).max(100),
        value: z.string().min(1).max(2000),
        description: z.string().max(200).optional(),
        ttlHours: z.number().int().min(1).max(8760).optional(),
      }),
      execute: async (args) => {
        try {
          await dbConnect();
          const expiresAt = args.ttlHours
            ? new Date(Date.now() + args.ttlHours * 3_600_000)
            : null;
          await AgentMemory.findOneAndUpdate(
            {
              brandId: context.brandId || '',
              key: args.key,
            },
            {
              $set: {
                value: args.value,
                description: args.description ?? null,
                expiresAt,
              },
            },
            { upsert: true, new: true }
          );
          return { success: true, key: args.key, stored: true };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
    }),
};

// ─── delete_memory ────────────────────────────────────────────────────────────

export const deleteMemoryTool = {
  name: 'delete_memory',
  description: 'Delete a brand-scoped memory entry by key.',
  parameters: z.object({
    key: z.string().min(1).max(100).describe('The memory key to delete.'),
  }),
  factory: (context: AgentContext) =>
    tool({
      description: 'Delete a brand memory entry.',
      parameters: z.object({ key: z.string().min(1).max(100) }),
      execute: async (args) => {
        try {
          await dbConnect();
          const result = await AgentMemory.deleteOne({
            brandId: context.brandId || '',
            key: args.key,
          });
          return { success: true, deleted: result.deletedCount > 0 };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
      },
    }),
};

// ─── list_memory_keys ─────────────────────────────────────────────────────────

const listMemoryKeysParams = z.object({
  limit: z.number().int().min(1).max(100).optional().describe('Max keys to return. Default: 50.'),
});

export const listMemoryKeysTool = {
  name: 'list_memory_keys',
  description:
    'List all memory keys stored for this brand. ' +
    'Use this to see what facts the agent has recorded before reading individual entries.',
  parameters: listMemoryKeysParams,
  factory: (context: AgentContext) =>
    tool({
      description: 'List brand memory keys.',
      parameters: listMemoryKeysParams,
      execute: async (args) => {
        try {
          await dbConnect();
          const entries = await AgentMemory.find(
            { brandId: context.brandId || '' },
            { key: 1, description: 1, updatedAt: 1, _id: 0 }
          )
            .sort({ updatedAt: -1 })
            .limit(args.limit ?? 50)
            .lean();
          return {
            total: entries.length,
            keys: entries.map(e => ({ key: e.key, description: e.description ?? null, updatedAt: e.updatedAt })),
          };
        } catch (error) {
          return { total: 0, keys: [], error: error instanceof Error ? error.message : String(error) };
        }
      },
    }),
};

// ─── Register ─────────────────────────────────────────────────────────────────

toolRegistry.register(readMemoryTool);
toolRegistry.register(writeMemoryTool);
toolRegistry.register(deleteMemoryTool);
toolRegistry.register(listMemoryKeysTool);
