/**
 * Voice WebSocket server launcher (Q3 option c).
 *
 * Run with: `node server/voice-ws.js`
 * Or via npm: `npm run voice-ws`
 *
 * Boots `tsx/cjs` so the TS implementation at `src/lib/voice/server/ws-handler.ts`
 * can be required directly. The actual server logic lives in that TS file;
 * this launcher is a tiny shim so server.js (the main Next.js custom server)
 * stays untouched.
 *
 * Env:
 *   VOICE_WS_PORT          (default 3001)
 *   VOICE_STT_PROVIDER     (deepgram | whisper | sarvam | twilio-hosted)
 *   VOICE_TTS_PROVIDER     (elevenlabs | openai | sarvam | twilio-polly)
 *   VOICE_LLM_MODEL        (passed to generateTextWithClient)
 *   VOICE_LLM_SYSTEM_PROMPT
 *   MONGODB_URI            (shared with main process)
 *   REDIS_URL              (for cross-process events to the HTTP Socket.io)
 *   WORKFLOW_ENCRYPTION_KEY (shared — needed to decrypt provider credentials)
 *   OPENAI_API_KEY / DEEPGRAM_API_KEY / ELEVENLABS_API_KEY / SARVAM_API_KEY
 */

'use strict';

require('tsx/cjs');

const { startVoiceWsServer } = require('../src/lib/voice/server/ws-handler');

startVoiceWsServer();
