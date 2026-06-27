/**
 * Luma (Dream Machine) video provider.
 *
 * API: `https://api.lumalabs.ai/dream-machine/v1/generations` (requires
 * API key with beta access). Long-running job pattern. When the API key is
 * available, swap the stub for the real implementation in the same
 * `generateVideo` shape used by Runway.
 */

import { makeNotImplementedProvider } from './_not-implemented';

export const lumaProvider = makeNotImplementedProvider({
  id: 'luma',
  sdk: 'native',
  task: 'B2-3.15 (Luma)',
  capabilities: { video: true, vision: false, streaming: false, toolCalling: false, text: false, image: false, audio: false, promptCaching: false },
});
