/**
 * Z.ai (Zhipu GLM) provider — OpenAI-compatible.
 *
 * Default endpoint is the international one (`api.z.ai/api/paas/v4`). Override
 * to the China endpoint via `ZAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4`.
 *
 * Models: `glm-4`, `glm-4.5`, `glm-4-plus`, `glm-4v-plus` (vision).
 */

import { makeOpenAICompatibleProvider } from './_openai-compatible';

const BASE_URL = process.env.ZAI_BASE_URL || 'https://api.z.ai/api/paas/v4';

export const zaiProvider = makeOpenAICompatibleProvider({
  id: 'zai',
  baseURL: BASE_URL,
  toolCalling: true,
  vision: true, // glm-4v-* variants
});
