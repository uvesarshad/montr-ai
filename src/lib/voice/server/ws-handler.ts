/**
 * Voice WebSocket server entrypoint.
 *
 * Runs in a separate Node process from the Next.js HTTP server (Q3 option c).
 * Twilio Media Streams establish a wss connection to:
 *   wss://example.com/api/v2/voice/media-stream/[callSessionId]
 *
 * This handler:
 *   1. Validates the call session exists and is recent.
 *   2. Builds the conversation engine with STT/TTS clients per env config.
 *   3. Attaches the Twilio media bridge — audio flows through and events
 *      get broadcast to the main process via Redis pub/sub.
 *
 * Started by `server/voice-ws.js` (CJS launcher with `tsx/cjs` for TS).
 */

import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';

import { initVoiceSubsystem } from '@/lib/voice/bootstrap';
import { callSessionRepository } from '@/lib/db/repository/voice';
import { attachTwilioMediaBridge } from '@/lib/voice/ai/twilio-media-bridge';
import { createSTTClient, type STTProviderId } from '@/lib/voice/ai/stt/index';
import { createTTSClient, type TTSProviderId } from '@/lib/voice/ai/tts/index';

initVoiceSubsystem();

const PORT = parseInt(process.env.VOICE_WS_PORT ?? '3001', 10);
const PATH_RE = /^\/api\/v2\/voice\/media-stream\/([a-f0-9]{24})$/i;
const STT_DEFAULT = (process.env.VOICE_STT_PROVIDER ?? 'deepgram') as STTProviderId;
const TTS_DEFAULT = (process.env.VOICE_TTS_PROVIDER ?? 'openai') as TTSProviderId;
const LLM_MODEL = process.env.VOICE_LLM_MODEL ?? 'gpt-4o-mini';
const LLM_SYSTEM_PROMPT_DEFAULT = process.env.VOICE_LLM_SYSTEM_PROMPT
  ?? 'You are MontrAI’s voice assistant. Speak naturally and keep answers short for telephony.';

export interface StartVoiceWsServerOptions {
  port?: number;
}

export function startVoiceWsServer(options: StartVoiceWsServerOptions = {}): http.Server {
  const port = options.port ?? PORT;
  const server = http.createServer((req, res) => {
    // Liveness check.
    if (req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = req.url ?? '';
    const match = url.match(PATH_RE);
    if (!match) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }
    const callSessionId = match[1];
    wss.handleUpgrade(req, socket, head, (ws) => {
      handleConnection(ws, callSessionId).catch((err) => {
        console.error('[voice-ws] connection handler failed:', err);
        try { ws.close(); } catch { /* ignore */ }
      });
    });
  });

  server.listen(port, () => {
    console.log(`[voice-ws] listening on :${port} for /api/v2/voice/media-stream/[id]`);
  });

  return server;
}

async function handleConnection(ws: WebSocket, callSessionId: string): Promise<void> {
  // Look up the call session to make sure it's real and not too old.
  // We don't have organizationId from the WS URL, so use the unscoped lookup —
  // the upgrade is authenticated by Twilio's TwiML originating from a verified
  // inbound number on our system.
  const { default: CallSession } = await import('@/lib/db/models/voice/call-session.model');
  const session = await CallSession.findById(callSessionId).exec();
  if (!session) {
    console.warn(`[voice-ws] unknown callSessionId ${callSessionId}`);
    ws.close();
    return;
  }

  const ageMs = Date.now() - new Date(session.startedAt ?? Date.now()).getTime();
  if (ageMs > 60 * 60 * 1000) {
    console.warn(`[voice-ws] callSessionId ${callSessionId} is too old (${Math.round(ageMs / 1000)}s)`);
    ws.close();
    return;
  }

  // Load AiBot (B3-4.5.5) first if set: bot supplies systemPrompt, KB context,
  // and indirectly a character via bot.aiCharacterId. Falls through to a direct
  // AiCharacter lookup (B2-3.13) when no bot is configured.
  const meta = (session.customMetadata as Record<string, unknown> | undefined) ?? {};
  const aiBotId = typeof meta.aiBotId === 'string' ? meta.aiBotId : undefined;
  let bot: import('@/lib/db/models/ai-bot.model').IAiBot | null = null;
  if (aiBotId) {
    try {
      const { aiBotRepository } = await import('@/lib/db/repository/ai-bot.repository');
      bot = await aiBotRepository.findActiveById(aiBotId, 'voice');
    } catch (err) {
      console.warn('[voice-ws] AiBot load failed:', err);
    }
  }

  // Resolve character source: bot.aiCharacterId wins over session.customMetadata.aiCharacterId.
  const aiCharacterId =
    bot?.aiCharacterId?.toString() ??
    (typeof meta.aiCharacterId === 'string' ? meta.aiCharacterId : undefined);

  let character: import('@/lib/db/models/ai-character.model').IAiCharacter | null = null;
  if (aiCharacterId) {
    try {
      const { default: AiCharacter } = await import('@/lib/db/models/ai-character.model');
      character = await AiCharacter.findOne({
        _id: aiCharacterId
      }).exec();
    } catch (err) {
      console.warn('[voice-ws] AiCharacter load failed:', err);
    }
  }

  const characterLanguage = character?.voice?.language ?? 'en-US';
  const characterTtsProvider = (character?.voice?.provider as TTSProviderId | undefined) ?? TTS_DEFAULT;
  const characterVoiceId = character?.voice?.voiceId;

  let stt;
  let tts;
  try {
    stt = createSTTClient({ provider: STT_DEFAULT, language: characterLanguage });
    tts = createTTSClient({
      provider: characterTtsProvider,
      language: characterLanguage,
      voice: characterVoiceId,
    });
  } catch (err) {
    console.error('[voice-ws] failed to construct STT/TTS clients:', err);
    ws.close();
    return;
  }

  // Build the system prompt. Precedence:
  //   1. explicit script in session customMetadata (per-call override)
  //   2. AiBot.systemPrompt when a bot is hydrated
  //   3. env default
  // Always layered with character personality + style descriptors when present.
  const promptParts: string[] = [];
  const explicitScript = typeof meta.script === 'string' ? meta.script : undefined;
  if (explicitScript) {
    promptParts.push(explicitScript);
  } else if (bot?.systemPrompt) {
    promptParts.push(bot.systemPrompt);
  } else {
    promptParts.push(LLM_SYSTEM_PROMPT_DEFAULT);
  }
  if (character?.personality) {
    promptParts.push(`Personality: ${character.personality}`);
  }
  if (character?.styleDescriptors && character.styleDescriptors.length > 0) {
    promptParts.push(`Style: ${character.styleDescriptors.join(', ')}`);
  }
  const systemPrompt = promptParts.join('\n\n');

  const llmModel = bot?.llmModel ?? LLM_MODEL;

  // KB/RAG + in-call tools (B3): build the bot's tool set so the agent can look
  // things up + take actions mid-call. KB ids come from the hydrated bot (🔒
  // org-scoped, never the caller); the CRM lookup tool is always available.
  const knowledgeBaseIds = bot?.knowledgeBaseIds?.map((id) => id.toString()) ?? [];
  const { buildVoiceTools } = await import('@/lib/voice/ai/tools');
  const voiceTools = buildVoiceTools({ knowledgeBaseIds });

  // Turn-detection mode (Phase 3). 'vad'/'semantic' activate the VAD + turn
  // detector + adaptive interruption path; they degrade to a better energy
  // detector when the ONNX models aren't installed. 'energy' keeps the legacy
  // STT-final barge-in path. Default to 'vad' — a strict improvement.
  const turnMode = (process.env.VOICE_TURN_DETECTION ?? 'vad') as
    | 'energy'
    | 'vad'
    | 'semantic';

  // Engine mode: 'realtime' (OpenAI speech-to-speech) vs 'cascaded' (default).
  // Per-call override via customMetadata.engine; else env VOICE_ENGINE_MODE.
  const engineMode = (
    (typeof meta.engine === 'string' ? meta.engine : undefined)
    ?? process.env.VOICE_ENGINE_MODE
    ?? 'cascaded'
  ) === 'realtime' ? 'realtime' : 'cascaded';

  attachTwilioMediaBridge(ws, {
    conversation: {
      callSessionId,
      engine: engineMode,
      agent: {
        model: llmModel,
        systemPrompt,
        tools: voiceTools,
        knowledgeBaseIds,
        brandId: bot?.brandId ? bot.brandId.toString() : null,
      },
      stt,
      tts,
      language: characterLanguage,
      audioEncoding: 'mulaw',
      sampleRate: 8000,
      turnDetection: {
        mode: turnMode,
        minSilenceMs: 480,
        maxSilenceMs: 1600,
        interruptMinMs: 280,
        falseInterruptionTimeoutMs: 900,
      },
    },
  });

  if (bot) {
    // Telemetry: track that the bot was activated for this call.
    try {
      const { aiBotRepository } = await import('@/lib/db/repository/ai-bot.repository');
      void aiBotRepository.incrementUsage(String(bot._id));
    } catch {
      // Best-effort.
    }
  }

  // Mark the call answered if it wasn't already.
  if (!session.answeredAt) {
    await callSessionRepository.updateStatus(callSessionId, {
      status: 'answered',
      answeredAt: new Date(),
    });
  }
}

/** Called by the launcher when running standalone. */
export function main(): void {
  startVoiceWsServer();
}

if (require.main === module) {
  main();
}
