/**
 * xAI (Grok) provider — OpenAI-compatible at `https://api.x.ai/v1`.
 *
 * Tracked as a separate provider id so billing, plan-tier gating, and
 * route-resolution stay independent from OpenAI proper.
 *
 * Models: `grok-4`, `grok-3`, `grok-3-mini`, `grok-3-fast`, `grok-vision-*`.
 */

import { makeOpenAICompatibleProvider } from './_openai-compatible';

export const xaiProvider = makeOpenAICompatibleProvider({
  id: 'xai',
  baseURL: 'https://api.x.ai/v1',
  toolCalling: true,
  vision: true,
});
