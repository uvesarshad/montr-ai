/**
 * Tool registry consumed by the AI bot runtime.
 *
 * Channel filtering: every tool runs on all 3 channels by default. Voice-only
 * tools can opt out via the `channels` field when added.
 */

import { searchKnowledgeBaseTool } from './search-knowledge-base';
import { createCrmActivityTool } from './create-crm-activity';
import { escalateToHumanTool } from './escalate-to-human';
import { setIntentTool } from './set-intent';

import type { BotToolRegistry } from './types';
import type { AiBotChannel } from '@/lib/db/models/ai-bot.model';

export type { BotTool, BotToolContext, BotToolRegistry } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tools: BotToolRegistry[string][] = [
  searchKnowledgeBaseTool,
  createCrmActivityTool,
  escalateToHumanTool,
  setIntentTool,
];

export function getBotTools(_channel: AiBotChannel): BotToolRegistry {
  const registry: BotToolRegistry = {};
  for (const t of tools) {
    registry[t.name] = t;
  }
  return registry;
}

export const ESCALATE_TOOL_NAME = escalateToHumanTool.name;
