/**
 * Twilio Media Streams ↔ VoiceConversationEngine bridge.
 *
 * Twilio sends each call's audio over a per-call WebSocket as base64-encoded
 * μ-law 8 kHz frames inside JSON envelopes:
 *   { event: 'connected' | 'start' | 'media' | 'stop', ... }
 *
 * This module is the adapter: feed it a WS, get back a managed engine
 * instance that handles transcription, AI replies, TTS playback, and barge-in.
 *
 * NOTE: hooking the WS upgrade itself requires a change in `server.js` (the
 * Next.js custom server). Phase 5 documents that wiring step; the function
 * here is the bridge logic the upgrade handler will call.
 */

import type { WebSocket } from 'ws';

import {
  VoiceConversationEngine,
  type VoiceConversationOptions,
  type IConversationEngine,
} from './conversation-engine';
import { createBargeInDetector } from './barge-in';
import { RealtimeConversationEngine, resolveRealtimeApiKey } from './realtime';

export interface TwilioMediaBridgeDeps {
  // Everything the engine needs except onAudioToCaller.
  conversation: Omit<VoiceConversationOptions, 'onAudioToCaller'>;
}

export function attachTwilioMediaBridge(
  ws: WebSocket,
  deps: TwilioMediaBridgeDeps,
): { engine: IConversationEngine; close: () => Promise<void> } {
  let streamSid: string | null = null;

  const sendAudio = (chunk: Uint8Array) => {
    if (!streamSid || ws.readyState !== ws.OPEN) return;
    ws.send(
      JSON.stringify({
        event: 'media',
        streamSid,
        media: { payload: Buffer.from(chunk).toString('base64') },
      }),
    );
  };
  // Twilio Media Streams: flush buffered outbound audio on barge-in.
  const clearAudio = () => {
    if (!streamSid || ws.readyState !== ws.OPEN) return;
    ws.send(JSON.stringify({ event: 'clear', streamSid }));
  };

  const engineOpts: VoiceConversationOptions = {
    ...deps.conversation,
    onAudioToCaller: sendAudio,
    onClearCallerAudio: clearAudio,
  };

  // Realtime (speech-to-speech) when requested AND a key is available; else the
  // cascaded engine. Realtime does server-side VAD/barge-in, so the local energy
  // barge-in detector is only attached for the cascaded path.
  const useRealtime =
    deps.conversation.engine === 'realtime'
    && resolveRealtimeApiKey(deps.conversation.agent.userApiKeys?.openai) !== null;
  if (deps.conversation.engine === 'realtime' && !useRealtime) {
    console.warn('[twilio-bridge] realtime requested but no API key — falling back to cascaded.');
  }

  const engine: IConversationEngine = useRealtime
    ? new RealtimeConversationEngine(engineOpts)
    : new VoiceConversationEngine(engineOpts);

  const bargeIn = useRealtime
    ? null
    : createBargeInDetector({
        encoding: 'mulaw',
        sampleRate: 8000,
        onBargeIn: () => engine.onBargeIn(),
      });

  const closeOnce = (() => {
    let closed = false;
    return async () => {
      if (closed) return;
      closed = true;
      try {
        await engine.stop();
      } catch (err) {
        console.error('[twilio-bridge] engine.stop threw:', err);
      }
      if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) {
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
    };
  })();

  void engine.start().catch((err) => {
    console.error('[twilio-bridge] engine.start failed:', err);
    void closeOnce();
  });

  ws.on('message', (raw: Buffer) => {
    let envelope: { event?: string; streamSid?: string; media?: { payload?: string } };
    try {
      envelope = JSON.parse(raw.toString('utf8'));
    } catch {
      return;
    }

    switch (envelope.event) {
      case 'start':
        streamSid = envelope.streamSid ?? null;
        break;
      case 'media': {
        const payload = envelope.media?.payload;
        if (!payload) break;
        const audio = Buffer.from(payload, 'base64');
        const audioBytes = new Uint8Array(audio);
        engine.writeAudioFromCaller(audioBytes);
        bargeIn?.ingest(audioBytes);
        break;
      }
      case 'stop':
        void closeOnce();
        break;
    }
  });

  ws.on('close', () => {
    void closeOnce();
  });

  ws.on('error', (err: Error) => {
    console.error('[twilio-bridge] socket error:', err);
    void closeOnce();
  });

  return { engine, close: closeOnce };
}
