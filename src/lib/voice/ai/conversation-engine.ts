/**
 * Voice conversation engine — orchestrates STT → LLM → TTS for a single call.
 *
 * Lifecycle:
 *   1. `start(callSessionId)` — initialize agent + transcript row + STT session.
 *   2. `onAudioFrom Caller(chunk)` — pipe to STT.
 *   3. On STT segment final: persist + ask agent for a reply + stream TTS back.
 *   4. `onBargeIn()` — abort current TTS stream when caller starts speaking.
 *   5. `stop()` — flush STT, finalize transcript, generate summary.
 *
 * Audio output from the engine is delivered via a caller-supplied
 * `onAudioToCaller` callback so the engine doesn't have to know whether the
 * downstream is a Twilio Media Stream, a SIP UA, or a test mock.
 */

import { Types } from 'mongoose';

import {
  callSessionRepository,
  callTranscriptRepository,
} from '@/lib/db/repository/voice';
import { broadcastVoiceEvent } from '../events';
import type { ICallTranscript } from '@/lib/db/models/voice/call-transcript.model';
import type { CallTranscriptSpeaker } from '@/lib/db/models/voice/call-transcript.model';
import { createVoiceAgent, type VoiceAgent, type VoiceAgentOptions } from './agent';
import { analyzeCallDisposition } from './analyze-disposition';
import { startCallTrace, type CallTrace } from '../observability';
import { estimateCallCost } from '../cost-estimate';
import type { STTSegmentEvent, STTSession, VoiceSTTClient } from './stt';
import type { VoiceTTSClient } from './tts';
import type { VoiceTurnDetectionConfig, VoiceEngineMode } from '../types';
import { createVad, type VadDetector } from './vad';
import { createTurnDetector, type TurnDetector } from './turn';
import { AdaptiveInterruptionController } from './interruption';

/** Per-turn / per-call latency + interaction metrics (Phase 7 persists these). */
export interface VoiceConversationMetrics {
  /** Number of completed user→agent turns. */
  turns: number;
  /** Number of times the caller interrupted the agent's TTS. */
  interruptions: number;
  /** Number of false interruptions where the agent resumed its speech. */
  resumedFalseInterruptions: number;
  /** Time-to-first-token: end-of-user-turn → agent reply ready (ms), per turn. */
  ttftMs: number[];
  /** Time-to-first-byte: agent reply ready → first TTS chunk emitted (ms). */
  ttfbMs: number[];
  /** Mean TTFT across turns (ms), or null if none recorded. */
  avgTtftMs: number | null;
  /** Mean TTFB across turns (ms), or null if none recorded. */
  avgTtfbMs: number | null;
}

export interface VoiceConversationOptions {
  callSessionId: string;
  /**
   * Agent config — model + system prompt, and optionally the bot's in-call
   * tools (`tools`) + KB ids (`knowledgeBaseIds`) + org/brand scope. These flow
   * straight through to `createVoiceAgent`, which runs a bounded tool-call loop
   * when tools are present (KB/RAG + CRM lookup) and the legacy fast path
   * otherwise.
   */
  agent: VoiceAgentOptions;
  stt: VoiceSTTClient;
  tts: VoiceTTSClient;
  language?: string;
  audioEncoding?: 'mulaw' | 'pcm16';
  sampleRate?: number;
  /**
   * Optional Phase 3 turn-taking. When provided with mode 'vad'/'semantic' the
   * engine uses VAD + a turn detector + adaptive interruption internally.
   * When omitted or mode 'energy', the legacy STT-`isFinal` path is used and
   * the caller's external barge-in detector (e.g. the Twilio bridge) drives
   * `onBargeIn()` as before. Always optional — fully backward-compatible.
   */
  turnDetection?: VoiceTurnDetectionConfig;
  /** Optional path to a VAD/EOU ONNX model asset (no-op until the dep lands). */
  turnModelPath?: string;
  /**
   * Which engine drives the call: 'cascaded' (STT→LLM→TTS, the default) or
   * 'realtime' (OpenAI speech-to-speech). The media bridge picks the engine
   * from this. Falls back to cascaded when realtime can't initialize.
   */
  engine?: VoiceEngineMode;
  /** Pushed each time TTS produces audio bytes. */
  onAudioToCaller: (chunk: Uint8Array) => void | Promise<void>;
  /**
   * Flush any audio already buffered toward the caller (realtime barge-in).
   * For Twilio Media Streams the bridge sends a `clear` message. Optional —
   * the cascaded engine aborts its own TTS and doesn't need it.
   */
  onClearCallerAudio?: () => void;
  /** Optional callback when the engine decides to hang up. */
  onRequestHangup?: () => void | Promise<void>;
}

/** Common lifecycle both the cascaded + realtime engines implement. */
export interface IConversationEngine {
  start(): Promise<void>;
  writeAudioFromCaller(chunk: Uint8Array): void;
  onBargeIn(): void;
  stop(): Promise<void>;
}

export class VoiceConversationEngine {
  private agent: VoiceAgent;
  private sttSession: STTSession | null = null;
  private transcript: ICallTranscript | null = null;
  private ttsAbort: AbortController | null = null;
  private callStartedAt = Date.now();
  private stopped = false;

  // ── Phase 3 turn-taking (only active when `turnDetection` is configured) ──
  private readonly turnTakingEnabled: boolean;
  private vad: VadDetector | null = null;
  private turnDetector: TurnDetector | null = null;
  private interruption: AdaptiveInterruptionController | null = null;
  /** Interim transcript accumulated for the in-flight user turn. */
  private pendingTranscript = '';
  /** Wall-clock of the last detected caller speech frame (for silence calc). */
  private lastSpeechAt = 0;
  /** True while the agent is currently speaking (TTS in flight). */
  private agentSpeaking = false;
  /** Last reply we were speaking, kept so a false-interruption can resume it. */
  private lastReplyText = '';

  // ── Metrics (Phase 7 persists; we only collect in memory) ──
  private metricInterruptions = 0;
  private metricResumes = 0;
  private metricTurns = 0;
  private metricTtft: number[] = [];
  private metricTtfb: number[] = [];
  /** Langfuse/OTEL call trace (no-op when tracing is unconfigured). */
  private trace: CallTrace | null = null;

  constructor(private opts: VoiceConversationOptions) {
    this.agent = createVoiceAgent(opts.agent);

    const mode = opts.turnDetection?.mode;
    this.turnTakingEnabled = mode === 'vad' || mode === 'semantic';
    if (this.turnTakingEnabled && opts.turnDetection) {
      const cfg = opts.turnDetection;
      this.vad = createVad({
        mode: cfg.mode,
        encoding: opts.audioEncoding ?? 'mulaw',
        sampleRate: opts.sampleRate ?? 8000,
        modelPath: opts.turnModelPath,
      });
      this.turnDetector = createTurnDetector({
        ...cfg,
        language: opts.language,
        modelPath: opts.turnModelPath,
      });
      this.interruption = new AdaptiveInterruptionController(
        this.vad,
        {
          interruptMinMs: cfg.interruptMinMs,
          interruptMinWords: cfg.interruptMinWords,
          falseInterruptionTimeoutMs: cfg.falseInterruptionTimeoutMs,
        },
        {
          onInterrupt: () => this.handleAdaptiveInterrupt(),
          onResume: () => this.handleAdaptiveResume(),
        },
      );
    }
  }

  async start(): Promise<void> {
    // Open a per-call trace (no-op + fail-open when Langfuse isn't configured).
    this.trace = startCallTrace({
      callSessionId: this.opts.callSessionId,
      brandId: this.opts.agent.brandId ?? undefined,
      direction: 'outbound',
    });

    this.transcript = await callTranscriptRepository.create({
      callSessionId: this.opts.callSessionId,
      language: this.opts.language,
      sttProvider: 'stub', // overridden when B2 wires a real provider
    });

    this.sttSession = await this.opts.stt.start({
      language: this.opts.language,
      sampleRate: this.opts.sampleRate ?? 8000,
      encoding: this.opts.audioEncoding ?? 'mulaw',
      onSegment: (event) => this.handleSttSegment(event),
      onError: (err) => {
        console.error('[voice-engine] STT error:', err.message);
      },
    });
  }

  /** Push audio bytes received from the caller. */
  writeAudioFromCaller(chunk: Uint8Array): void {
    if (this.stopped || !this.sttSession) return;
    this.sttSession.writeAudio(chunk);

    // Phase 3: drive VAD-based interruption from the same audio stream. The
    // controller decides (via sustained-speech + word gates) whether to cut
    // TTS, so the crude external barge-in detector is superseded when enabled.
    if (this.turnTakingEnabled && this.interruption) {
      this.interruption.ingest(chunk);
      if (this.vad?.isSpeaking()) {
        this.lastSpeechAt = Date.now();
      }
    }
  }

  /**
   * Caller started speaking → cancel current TTS playback.
   *
   * Backward-compatible entry point still called by the Twilio bridge's energy
   * barge-in detector. When Phase 3 turn-taking is enabled the internal
   * adaptive controller is the primary driver, but this remains a safe no-op-
   * if-already-aborted fallback so existing callers keep working unchanged.
   */
  onBargeIn(): void {
    if (this.ttsAbort) {
      this.ttsAbort.abort();
      this.ttsAbort = null;
    }
  }

  /** Snapshot of in-memory conversation metrics (Phase 7 persists these). */
  getMetrics(): VoiceConversationMetrics {
    const avg = (xs: number[]): number | null =>
      xs.length === 0 ? null : Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
    return {
      turns: this.metricTurns,
      interruptions: this.metricInterruptions,
      resumedFalseInterruptions: this.metricResumes,
      ttftMs: [...this.metricTtft],
      ttfbMs: [...this.metricTtfb],
      avgTtftMs: avg(this.metricTtft),
      avgTtfbMs: avg(this.metricTtfb),
    };
  }

  /** Adaptive controller decided the caller really interrupted → cut TTS. */
  private handleAdaptiveInterrupt(): void {
    this.metricInterruptions += 1;
    this.onBargeIn();
  }

  /**
   * Adaptive controller decided the interruption was false (caller went quiet
   * again without committing a turn) → resume the agent's prior reply.
   */
  private handleAdaptiveResume(): void {
    if (this.stopped) return;
    if (!this.lastReplyText || this.agentSpeaking) return;
    this.metricResumes += 1;
    void this.speak(this.lastReplyText);
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.ttsAbort?.abort();
    this.interruption?.reset();
    await this.sttSession?.close();

    let plainText = '';
    if (this.transcript?._id) {
      const segments = this.agent.history();
      plainText = segments
        .filter((m) => m.role !== 'system')
        .map((m) => (typeof m.content === 'string' ? m.content : ''))
        .filter(Boolean)
        .join('\n');
      await callTranscriptRepository.finalize(this.transcript._id.toString(), {
        plainText,
        status: 'ready',
      });
    }

    // Coalesce the cheap (no-network) writes — transcriptId + cost — into ONE
    // updateStatus, plus metrics into customMetadata. This frees the worker slot
    // fast; the blocking disposition LLM runs detached below.
    const metrics = this.getMetrics();
    let costTotal = 0;
    try {
      const breakdown = estimateCallCost({
        durationSec: (Date.now() - this.callStartedAt) / 1000,
        turns: metrics.turns,
        llmModel: this.opts.agent.model,
      });
      costTotal = breakdown.total;
      this.trace?.setCost(costTotal);
      await callSessionRepository.updateStatus(this.opts.callSessionId, {
        ...(this.transcript?._id ? { transcriptId: this.transcript._id as Types.ObjectId } : {}),
        costBreakdown: breakdown,
        costAmount: breakdown.total,
        costCurrency: 'USD',
      });
      await callSessionRepository.updateMetadata(this.opts.callSessionId, {
        voiceMetrics: {
          turns: metrics.turns,
          interruptions: metrics.interruptions,
          resumedFalseInterruptions: metrics.resumedFalseInterruptions,
          avgTtftMs: metrics.avgTtftMs,
          avgTtfbMs: metrics.avgTtfbMs,
        },
      });
    } catch (err) {
      console.error('[voice-engine] cost/metrics persist failed:', err);
    }

    // Detached tail: the disposition LLM (seconds) + trace flush. Running this
    // un-awaited lets the worker free its session slot the instant the socket
    // closes instead of blocking the fleet on a network round-trip. Best-effort.
    void this.finalizePostCall(plainText);
  }

  /** Post-call disposition analysis + trace flush — runs detached from stop(). */
  private async finalizePostCall(plainText: string): Promise<void> {
    if (plainText.trim()) {
      try {
        const sess = await callSessionRepository.findById(
          this.opts.callSessionId
        );
        const disp = await analyzeCallDisposition({
          transcriptText: plainText,
          endReasonHint: sess?.endReason,
        });
        if (disp) {
          this.trace?.setDisposition(disp);
          await callSessionRepository.updateStatus(this.opts.callSessionId, {
            disposition: {
              outcome: disp.outcome,
              sentiment: disp.sentiment,
              category: disp.category,
              notes: disp.notes,
            },
          });
        }
      } catch (err) {
        console.error('[voice-engine] disposition analysis failed:', err);
      }
    }
    try {
      this.trace?.end({ metrics: { ...this.getMetrics() } as Record<string, unknown> });
      await this.trace?.flush();
    } catch (err) {
      console.error('[voice-engine] trace flush failed:', err);
    }
  }

  private async handleSttSegment(event: STTSegmentEvent): Promise<void> {
    if (this.stopped) return;

    // ── Phase 3 path: VAD/semantic turn-taking ──
    if (this.turnTakingEnabled && this.turnDetector) {
      const text = event.text.trim();
      if (text) {
        // Feed the interruption word-gate from interim+final transcript.
        this.interruption?.noteWords(countWords(text) - countWords(this.pendingTranscript));
        this.pendingTranscript = text;
      }

      if (!event.isFinal) {
        // Still mid-utterance — only commit when the turn detector agrees.
        const silenceMs = this.lastSpeechAt ? Date.now() - this.lastSpeechAt : 0;
        const end = await this.turnDetector.shouldEndTurn({
          transcriptSoFar: this.pendingTranscript,
          silenceMs,
          config: this.opts.turnDetection!,
          // Recent turns give the semantic EOU model conversational context.
          history: this.agent
            .history()
            .filter(
              (m): m is { role: 'user' | 'assistant'; content: string } =>
                (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string',
            )
            .slice(-5)
            .map((m) => ({ role: m.role, content: m.content })),
        });
        if (!end || !this.pendingTranscript.trim()) return;
      } else if (!this.pendingTranscript.trim()) {
        return;
      }

      const userText = this.pendingTranscript.trim();
      this.pendingTranscript = '';
      this.interruption?.commitTurn();
      await this.runTurn(userText, event);
      return;
    }

    // ── Legacy path: respond on STT final segments only ──
    if (!event.isFinal || !event.text.trim()) return;
    await this.runTurn(event.text, event);
  }

  /** Persist the user segment, get an agent reply, persist + speak it. */
  private async runTurn(userText: string, event: STTSegmentEvent): Promise<void> {
    await this.persistSegment({
      speaker: event.speaker,
      text: userText,
      startSec: event.startSec,
      endSec: event.endSec,
      confidence: event.confidence,
    });

    const turnSpan = this.trace?.startTurn(userText) ?? null;
    turnSpan?.event('stt', { confidence: event.confidence });

    const turnEndedAt = Date.now();
    let reply: string;
    try {
      reply = await this.agent.respond(userText);
    } catch (err) {
      console.error('[voice-engine] agent error:', err);
      turnSpan?.end();
      return;
    }
    // TTFT: end-of-user-turn → agent reply ready.
    const ttftMs = Date.now() - turnEndedAt;
    this.metricTtft.push(ttftMs);
    this.metricTurns += 1;
    this.lastReplyText = reply;
    turnSpan?.setReply(reply, { ttftMs });

    const replyStartSec = (Date.now() - this.callStartedAt) / 1000;
    await this.persistSegment({
      speaker: 'ai_bot',
      text: reply,
      startSec: replyStartSec,
      endSec: replyStartSec, // refined when TTS finishes
    });

    await this.speak(reply, turnEndedAt);
    turnSpan?.end();
  }

  private async persistSegment(segment: {
    speaker: CallTranscriptSpeaker;
    text: string;
    startSec: number;
    endSec: number;
    confidence?: number;
  }): Promise<void> {
    if (!this.transcript?._id) return;
    await callTranscriptRepository.appendSegment(this.transcript._id.toString(), {
      speaker: segment.speaker,
      text: segment.text,
      startSec: segment.startSec,
      endSec: segment.endSec,
      confidence: segment.confidence,
    });
    // Live broadcast so connected dialer UIs render the segment in real time.
    broadcastVoiceEvent(this.opts.callSessionId, {
      type: 'transcript.segment',
      providerCallId: this.opts.callSessionId,
      at: new Date(),
      speaker: segment.speaker,
      text: segment.text,
      startSec: segment.startSec,
      endSec: segment.endSec,
      isFinal: true,
    });
  }

  private async speak(text: string, replyReadyAt?: number): Promise<void> {
    if (this.stopped) return;
    this.ttsAbort = new AbortController();
    this.agentSpeaking = true;
    let firstChunk = true;
    const stream = this.opts.tts.stream(text, {
      abortSignal: this.ttsAbort.signal,
      encoding: this.opts.audioEncoding ?? 'mulaw',
      sampleRate: this.opts.sampleRate ?? 8000,
    });

    try {
      for await (const chunk of stream) {
        if (this.ttsAbort?.signal.aborted) break;
        if (firstChunk) {
          firstChunk = false;
          // TTFB: agent reply ready → first audible TTS chunk.
          if (replyReadyAt !== undefined) {
            this.metricTtfb.push(Date.now() - replyReadyAt);
          }
        }
        await this.opts.onAudioToCaller(chunk);
      }
    } catch (err) {
      if (
        err instanceof Error
        && (err.name === 'AbortError' || err.message.includes('abort'))
      ) {
        return;
      }
      throw err;
    } finally {
      this.ttsAbort = null;
      this.agentSpeaking = false;
    }
  }
}

/** Count whitespace-delimited words in a transcript fragment. */
function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}
