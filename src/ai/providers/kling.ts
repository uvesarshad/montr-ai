/**
 * Kling (Kuaishou) video provider — gated, China-region with international
 * gateway. API: `https://api.klingai.com/v1/videos/text2video` (intl) or
 * via the China-region endpoint. Long-running job pattern.
 *
 * Auth uses JWT signed with `ACCESS_KEY` + `SECRET_KEY` rather than a single
 * Bearer token — the real implementation will need to sign per request.
 */

import { makeNotImplementedProvider } from './_not-implemented';

export const klingProvider = makeNotImplementedProvider({
  id: 'kling',
  sdk: 'native',
  task: 'B2-3.15 (Kling)',
  capabilities: { video: true, vision: false, streaming: false, toolCalling: false, text: false, image: false, audio: false, promptCaching: false },
});
