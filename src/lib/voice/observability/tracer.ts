/**
 * Voice call tracing — Langfuse (+ optional OpenTelemetry) instrumentation for
 * the conversation engine.
 *
 * Model: one Langfuse TRACE per call, one nested GENERATION (the LLM reply) plus
 * sibling SPANs/EVENTS (STT, TTS, EOU) per turn. Call-level metadata (org, bot,
 * direction, disposition, cost, aggregate latency) is attached to the trace.
 *
 * Design rules:
 *   - Fail-open + no-op: with no Langfuse credentials (env or passed-in) every
 *     method is a harmless no-op. A tracing error must NEVER break a call, so
 *     every Langfuse interaction is wrapped — failures are swallowed (logged).
 *   - No side effects on import: the Langfuse client is created lazily on the
 *     first `startCallTrace(...)` that has credentials, and cached per
 *     credential set.
 *   - 🔒 organizationId is carried into trace metadata; the caller passes it
 *     (never trust client input).
 *
 * ── How the parent wires this into conversation-engine.ts ──
 *   start():    const trace = startCallTrace({ callSessionId, organizationId,
 *                 brandId, direction, botId, langfuse });           // store on `this`
 *   runTurn():  const turn = trace.startTurn(userText);
 *               // ...stt event, then around agent.respond():
 *               turn.event('stt', { text: userText, confidence });
 *               // reply = await agent.respond(...)
 *               turn.setReply(reply, { ttftMs });
 *               // ...around speak(): turn.event('tts', { firstChunkMs: ttfbMs });
 *               turn.end();
 *   stop():     trace.setDisposition(disp); trace.setCost(breakdown.total);
 *               trace.end({ metrics: this.getMetrics() });
 *               await trace.flush();   // Langfuse batches — MUST flush at end
 */

import type {
  LangfuseGenerationClient,
  LangfuseTraceClient,
} from 'langfuse';

import {
  resolveLangfuseCredentials,
  type LangfuseCredentialOverride,
  type LangfuseCredentials,
} from './config';

// ───────────────────────────── Public types ─────────────────────────────

export type CallDirection = 'inbound' | 'outbound';

/** Input for starting a per-call trace. */
export interface StartCallTraceInput {
  /** 🔒 Scoping identifiers — supplied by the engine, never the client. */
  callSessionId: string;
  organizationId?: string;
  brandId?: string;
  botId?: string;
  direction: CallDirection;
  /** Optional per-org Langfuse override; falls back to env when omitted. */
  langfuse?: LangfuseCredentialOverride;
  /** Optional starting metadata merged into the trace. */
  metadata?: Record<string, unknown>;
}

/** Latency/interaction summary persisted at call end (mirrors getMetrics()). */
export interface CallTraceSummary {
  turns?: number;
  interruptions?: number;
  resumedFalseInterruptions?: number;
  avgTtftMs?: number | null;
  avgTtfbMs?: number | null;
  metrics?: Record<string, unknown>;
}

/** Disposition outcome attached to the trace at call end. */
export interface CallTraceDisposition {
  outcome?: string;
  sentiment?: string;
  category?: string;
  notes?: string;
}

/** A per-turn span (one user→agent exchange). */
export interface TurnSpan {
  /** Record a point-in-time event (e.g. STT/EOU) on this turn. */
  event(name: string, data?: Record<string, unknown>): void;
  /**
   * Open a named child span (e.g. 'tts') and return a closer. Useful for
   * wrapping an awaited stage; call the returned fn when the stage finishes.
   */
  span(name: string, input?: Record<string, unknown>): (output?: Record<string, unknown>) => void;
  /** Attach the agent's reply + latency to this turn's generation. */
  setReply(text: string, latency?: { ttftMs?: number; ttfbMs?: number }): void;
  /** Close the turn span. */
  end(): void;
}

/** A per-call trace. */
export interface CallTrace {
  /** Begin a new turn span for the given user utterance. */
  startTurn(userText: string): TurnSpan;
  /** Merge metadata onto the trace. */
  setMetadata(meta: Record<string, unknown>): void;
  /** Set the call disposition (outcome/sentiment/category/notes). */
  setDisposition(disposition: CallTraceDisposition): void;
  /** Set the estimated all-in call cost (USD). */
  setCost(costUsd: number): void;
  /** Finalize the trace with an end-of-call summary. */
  end(summary?: CallTraceSummary): void;
  /** Flush batched events to Langfuse. MUST be awaited at call end. */
  flush(): Promise<void>;
}

// ─────────────────────────── Lazy client cache ───────────────────────────

// Langfuse is required lazily so importing this module has no side effects and
// works even if the dep is somehow absent at runtime.
type LangfuseClient = import('langfuse').Langfuse;
let LangfuseCtor: (new (opts: Record<string, unknown>) => LangfuseClient) | null | undefined;

/** Per-credential-set client cache keyed by publicKey|baseUrl. */
const clientCache = new Map<string, LangfuseClient>();

function credKey(creds: LangfuseCredentials): string {
  return `${creds.publicKey}|${creds.baseUrl ?? ''}`;
}

function getLangfuseCtor(): (new (opts: Record<string, unknown>) => LangfuseClient) | null {
  if (LangfuseCtor !== undefined) return LangfuseCtor;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const mod = require('langfuse') as { Langfuse: new (opts: Record<string, unknown>) => LangfuseClient };
    LangfuseCtor = mod.Langfuse ?? null;
  } catch (err) {
    console.error('[voice-trace] langfuse unavailable:', (err as Error)?.message);
    LangfuseCtor = null;
  }
  return LangfuseCtor;
}

function getClient(creds: LangfuseCredentials): LangfuseClient | null {
  const key = credKey(creds);
  const existing = clientCache.get(key);
  if (existing) return existing;

  const Ctor = getLangfuseCtor();
  if (!Ctor) return null;

  try {
    const client = new Ctor({
      publicKey: creds.publicKey,
      secretKey: creds.secretKey,
      baseUrl: creds.baseUrl,
      // Don't let SDK warnings spam call logs in production.
      flushAt: 16,
    });
    clientCache.set(key, client);
    return client;
  } catch (err) {
    console.error('[voice-trace] failed to init langfuse client:', (err as Error)?.message);
    return null;
  }
}

// ─────────────────────────── OTEL (optional) ───────────────────────────

// @opentelemetry/api is available transitively (Sentry). Guard the import so
// its absence is fine and OTEL emission is purely additive.
type OtelTracer = {
  startSpan: (name: string, opts?: unknown) => { end: () => void; setAttribute?: (k: string, v: unknown) => void };
};
let otelTracer: OtelTracer | null | undefined;

function getOtelTracer(): OtelTracer | null {
  if (otelTracer !== undefined) return otelTracer;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const otel = require('@opentelemetry/api') as { trace?: { getTracer: (n: string) => OtelTracer } };
    otelTracer = otel.trace ? otel.trace.getTracer('voice') : null;
  } catch {
    otelTracer = null;
  }
  return otelTracer;
}

// ─────────────────────────── No-op implementation ───────────────────────────

const NOOP_TURN: TurnSpan = {
  event() {},
  span() {
    return () => {};
  },
  setReply() {},
  end() {},
};

const NOOP_TRACE: CallTrace = {
  startTurn() {
    return NOOP_TURN;
  },
  setMetadata() {},
  setDisposition() {},
  setCost() {},
  end() {},
  async flush() {},
};

// ─────────────────────────── Live implementation ───────────────────────────

class LiveTurnSpan implements TurnSpan {
  private generation: LangfuseGenerationClient | null = null;
  private turnIndex: number;

  constructor(
    private trace: LangfuseTraceClient,
    userText: string,
    turnIndex: number,
  ) {
    this.turnIndex = turnIndex;
    try {
      this.generation = trace.generation({
        name: `turn-${turnIndex}`,
        input: userText,
        startTime: new Date(),
      });
    } catch (err) {
      console.error('[voice-trace] turn start failed:', (err as Error)?.message);
    }
  }

  event(name: string, data?: Record<string, unknown>): void {
    try {
      const parent = this.generation ?? this.trace;
      parent.event({ name, metadata: data });
    } catch (err) {
      console.error('[voice-trace] event failed:', (err as Error)?.message);
    }
  }

  span(name: string, input?: Record<string, unknown>): (output?: Record<string, unknown>) => void {
    let child: { end: (body?: Record<string, unknown>) => void } | null = null;
    try {
      const parent = this.generation ?? this.trace;
      child = parent.span({ name, input, startTime: new Date() });
    } catch (err) {
      console.error('[voice-trace] span start failed:', (err as Error)?.message);
    }
    return (output?: Record<string, unknown>) => {
      try {
        // Langfuse stamps endTime itself on end(); only pass output.
        child?.end(output ? { output } : undefined);
      } catch {
        /* swallow — tracing must never throw into a call */
      }
    };
  }

  setReply(text: string, latency?: { ttftMs?: number; ttfbMs?: number }): void {
    try {
      this.generation?.update({
        output: text,
        metadata: latency ? { ttftMs: latency.ttftMs, ttfbMs: latency.ttfbMs } : undefined,
      });
    } catch (err) {
      console.error('[voice-trace] setReply failed:', (err as Error)?.message);
    }
  }

  end(): void {
    try {
      this.generation?.end();
    } catch {
      /* swallow */
    }
  }
}

class LiveCallTrace implements CallTrace {
  private trace: LangfuseTraceClient;
  private turnCount = 0;
  private metadata: Record<string, unknown>;

  constructor(
    private client: LangfuseClient,
    input: StartCallTraceInput,
  ) {
    // 🔒 organizationId + scoping carried into trace metadata.
    this.metadata = {
      brandId: input.brandId,
      botId: input.botId,
      direction: input.direction,
      ...input.metadata,
    };
    this.trace = client.trace({
      name: 'voice.call',
      sessionId: input.callSessionId,
      // Group all of an org's calls under a stable Langfuse user bucket.
      userId: input.organizationId,
      metadata: this.metadata,
      tags: ['voice', input.direction, ...(input.botId ? [`bot:${input.botId}`] : [])],
    });

    // Optional additive OTEL call-level span (best-effort).
    try {
      getOtelTracer()
        ?.startSpan('voice.call', undefined)
        ?.end();
    } catch {
      /* swallow */
    }
  }

  startTurn(userText: string): TurnSpan {
    this.turnCount += 1;
    try {
      return new LiveTurnSpan(this.trace, userText, this.turnCount);
    } catch (err) {
      console.error('[voice-trace] startTurn failed:', (err as Error)?.message);
      return NOOP_TURN;
    }
  }

  setMetadata(meta: Record<string, unknown>): void {
    try {
      this.metadata = { ...this.metadata, ...meta };
      this.trace.update({ metadata: this.metadata });
    } catch (err) {
      console.error('[voice-trace] setMetadata failed:', (err as Error)?.message);
    }
  }

  setDisposition(disposition: CallTraceDisposition): void {
    this.setMetadata({ disposition });
    // Sentiment is also surfaced as a Langfuse score for filtering/eval.
    try {
      if (disposition.outcome) {
        this.trace.score({ name: 'disposition', value: 0, comment: disposition.outcome });
      }
    } catch {
      /* swallow */
    }
  }

  setCost(costUsd: number): void {
    this.setMetadata({ costUsd });
  }

  end(summary?: CallTraceSummary): void {
    try {
      if (summary) this.setMetadata({ summary });
      this.trace.update({ metadata: this.metadata });
    } catch (err) {
      console.error('[voice-trace] end failed:', (err as Error)?.message);
    }
  }

  async flush(): Promise<void> {
    try {
      await this.client.flushAsync();
    } catch (err) {
      console.error('[voice-trace] flush failed:', (err as Error)?.message);
    }
  }
}

// ───────────────────────────── Public API ─────────────────────────────

/**
 * Start a trace for a single voice call. Returns a no-op trace (every method
 * harmless) when no Langfuse credentials are available — callers don't need to
 * branch. Never throws.
 */
export function startCallTrace(input: StartCallTraceInput): CallTrace {
  try {
    const creds = resolveLangfuseCredentials(input.langfuse);
    if (!creds) return NOOP_TRACE;

    const client = getClient(creds);
    if (!client) return NOOP_TRACE;

    return new LiveCallTrace(client, input);
  } catch (err) {
    console.error('[voice-trace] startCallTrace failed:', (err as Error)?.message);
    return NOOP_TRACE;
  }
}

/**
 * True when voice tracing is enabled (env or passed-in override resolves to a
 * complete credential set). Cheap — safe to call per request.
 */
export function isEnabled(override?: LangfuseCredentialOverride): boolean {
  return resolveLangfuseCredentials(override) !== null;
}

/** Flush + shut down all cached Langfuse clients (e.g. on process exit). */
export async function shutdownVoiceTracing(): Promise<void> {
  const clients = [...clientCache.values()];
  clientCache.clear();
  await Promise.all(
    clients.map(async (c) => {
      try {
        await c.shutdownAsync();
      } catch {
        /* swallow */
      }
    }),
  );
}
