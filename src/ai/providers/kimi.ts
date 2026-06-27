/**
 * Kimi (Moonshot AI) provider — OpenAI-compatible.
 *
 * Default endpoint is the international one (`api.moonshot.ai/v1`). Override
 * to the China endpoint via `MOONSHOT_BASE_URL=https://api.moonshot.cn/v1`.
 *
 * Models: `kimi-k2`, `moonshot-v1-8k`, `moonshot-v1-32k`, `moonshot-v1-128k`.
 * The 128k-context model is the differentiator.
 */

import { makeOpenAICompatibleProvider } from './_openai-compatible';

const BASE_URL = process.env.MOONSHOT_BASE_URL || 'https://api.moonshot.ai/v1';

export const kimiProvider = makeOpenAICompatibleProvider({
  id: 'kimi',
  baseURL: BASE_URL,
  toolCalling: true,
  vision: false,
});
