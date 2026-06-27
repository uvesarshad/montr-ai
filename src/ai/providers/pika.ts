/**
 * Pika video provider — invitation/beta API.
 *
 * The Pika developer API is invite-only at the time of writing. This stub
 * captures the canonical request shape so when the API opens, only the
 * `generateVideo()` body needs to be filled in. Same long-running job
 * pattern as Runway — submit, return processing, worker polls.
 *
 * When implemented, set `PIKA_BASE_URL` (defaults to `https://api.pika.art`).
 */

import { makeNotImplementedProvider } from './_not-implemented';

export const pikaProvider = makeNotImplementedProvider({
  id: 'pika',
  sdk: 'native',
  task: 'B2-3.15 (Pika)',
  capabilities: { video: true, vision: false, streaming: false, toolCalling: false, text: false, image: false, audio: false, promptCaching: false },
});
