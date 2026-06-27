/**
 * LiveKit ⇄ conversation-engine bridge (Phase 8 — STUB / SCAFFOLD ONLY).
 *
 * ⚠️ THIS IS A SCAFFOLD. No real RTP/track audio is plumbed here. It documents
 *    the seam and provides the interface + skeleton so the live implementation
 *    is a fill-in, not a redesign. See the `// TODO(live):` markers.
 *
 * ── Why this maps cleanly onto the existing engine ──────────────────────────
 * The conversation engine is provider-agnostic about TRANSPORT. The Twilio path
 * (`src/lib/voice/ai/twilio-media-bridge.ts`) already proves the seam:
 *   - inbound caller audio frames  →  engine STT  (engine consumes raw PCM/mulaw)
 *   - engine TTS audio             →  `onAudioToCaller(frame)`  →  back to caller
 *
 * LiveKit is just a DIFFERENT transport for the SAME two directions:
 *   - the caller's published audio TRACK   ⇒ engine STT input
 *   - the engine's TTS output             ⇒ a LiveKit track WE publish as the
 *                                            "agent" participant via `onAudioToCaller`
 *
 * So a LiveKit-backed call slots into the SAME dispatch/worker shape as a
 * Twilio media-stream call (see `src/lib/voice/dispatch/call-worker.ts`): a
 * worker admits the `call_session`, attaches a bridge, and the bridge owns the
 * audio lifecycle until the room/participant ends. The ONLY new work is the RTP
 * track plumbing below — everything around it (session hydration, STT/TTS
 * selection, turn detection, teardown) is reused unchanged.
 *
 * ── What's missing for "live" (deliberately not done here) ──────────────────
 *   1. `livekit-server-sdk` does NOT join rooms as a media participant. To
 *      consume/produce audio server-side you need either:
 *        a) the LiveKit Agents framework (Python/Node `@livekit/agents`) running
 *           as a separate agent process that LiveKit dispatches into the room, OR
 *        b) a server-side WebRTC client (`@livekit/rtc-node`) that joins the room
 *           with an "agent" token and pumps tracks.
 *      Neither dep is installed (see the deployment-gap doc). This stub assumes
 *      path (b): a node RTC client joins with a publish+subscribe token.
 *   2. Decode Opus from the subscribed caller track → PCM frames for STT.
 *   3. Encode engine TTS PCM → an Opus track published as the agent participant.
 *   4. Wire LiveKit's track-subscribed / participant-disconnected events to the
 *      engine's start/stop lifecycle.
 */

import type { VoiceTurnDetectionConfig } from '@/lib/voice/types';

/**
 * Inputs needed to attach a LiveKit room to the conversation engine. Mirrors the
 * shape the Twilio bridge consumes (callSessionId/org + agent + stt/tts) so the
 * worker can build it the same way for either transport.
 */
export interface LiveKitBridgeOptions {
  /** MontrAI `call_session._id` — correlates the room to the DB row. */
  callSessionId: string;
  /** 🔒 Owning org. */
  organizationId?: string;
  brandId?: string | null;
  /** Deterministic room name (`roomNameForCall`). */
  roomName: string;
  /**
   * The identity the engine publishes its TTS audio under (the "agent" leg).
   * A server-side RTC client joins the room with this identity + a publish token.
   */
  agentIdentity: string;
  /** Agent/LLM config the engine drives the turn with. */
  agent: { model: string; systemPrompt: string };
  /** Turn-detection config (reused from the shared voice types). */
  turnDetection?: VoiceTurnDetectionConfig;
}

/**
 * Handle returned by `attachLiveKitBridge`. `close()` tears down the room
 * connection + engine. Mirrors the Twilio bridge's `{ close }` contract so the
 * worker treats both transports identically.
 */
export interface LiveKitBridgeHandle {
  /** Resolves once the engine + room connection are fully torn down. */
  close(): Promise<void>;
  /** True once real RTP plumbing is wired (always false in the scaffold). */
  readonly live: boolean;
}

/**
 * Attach a LiveKit room to the conversation engine.
 *
 * STUB: returns a handle whose `close()` is a no-op and `live === false`. The
 * worker can call this without crashing, but NO audio flows until the
 * `// TODO(live)` sections are implemented with a server-side RTC client.
 */
export async function attachLiveKitBridge(
  opts: LiveKitBridgeOptions,
): Promise<LiveKitBridgeHandle> {
  // ── TODO(live): wire LiveKit track audio <-> engine ──────────────────────
  //
  // 1. Connect to the room as the agent participant:
  //      // import { Room } from '@livekit/rtc-node';   // NOT INSTALLED
  //      // const token = await mintAccessToken({
  //      //   organizationId: opts.organizationId,
  //      //   brandId: opts.brandId,
  //      //   callSessionId: opts.callSessionId,
  //      //   identity: opts.agentIdentity,
  //      //   roomName: opts.roomName,
  //      //   canPublish: true, canSubscribe: true,
  //      // });
  //      // const room = new Room();
  //      // await room.connect(getLiveKitClientUrl()!, token!.token);
  //
  // 2. Subscribe to the caller's audio track → decode Opus → PCM → engine STT:
  //      // room.on('trackSubscribed', (track) => { /* feed frames to engine.pushAudio() */ });
  //
  // 3. Build the engine (same hydration as call-worker.ts#runMediaStreamCall:
  //    bot/character → stt/tts/systemPrompt/turnDetection) and provide the
  //    `onAudioToCaller` seam to publish TTS frames back as the agent track:
  //      // const engine = createConversationEngine({
  //      //   callSessionId: opts.callSessionId,
  //      //   organizationId: opts.organizationId,
  //      //   agent: opts.agent,
  //      //   stt, tts, turnDetection: opts.turnDetection,
  //      //   onAudioToCaller: (frame) => agentTrackSource.captureFrame(frame),
  //      // });
  //
  // 4. End the bridge on participant-disconnected / room-finished:
  //      // room.on('disconnected', () => handle.close());
  //
  // ─────────────────────────────────────────────────────────────────────────

  console.warn(
    `[livekit-bridge] STUB — no audio plumbing. call=${opts.callSessionId} ` +
      `room=${opts.roomName} org=${opts.organizationId}. ` +
      'Install @livekit/rtc-node (or use @livekit/agents) and implement the ' +
      'TODO(live) sections to carry real audio.',
  );

  return {
    live: false,
    async close() {
      // TODO(live): disconnect the RTC room + tear down the engine here.
    },
  };
}
