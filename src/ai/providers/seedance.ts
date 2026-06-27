/**
 * ByteDance Seedance video provider — China-region via Volcano Engine / Ark.
 * API: `https://ark.cn-beijing.volces.com/api/v3/generations/videos`. Same
 * long-running job pattern as the other video providers.
 *
 * Auth: Bearer with the Volcano Engine API key. Plan-tier gating happens
 * upstream.
 */

import { makeNotImplementedProvider } from './_not-implemented';

export const seedanceProvider = makeNotImplementedProvider({
  id: 'seedance',
  sdk: 'native',
  task: 'B2-3.15 (Seedance)',
  capabilities: { video: true, vision: false, streaming: false, toolCalling: false, text: false, image: false, audio: false, promptCaching: false },
});
