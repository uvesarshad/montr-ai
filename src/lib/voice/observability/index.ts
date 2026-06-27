/**
 * Voice observability — Langfuse (+ optional OTEL) tracing for voice calls.
 *
 * Public surface: `startCallTrace` to open a per-call trace, `isVoiceTracingEnabled`
 * to feature-gate, and the `CallTrace`/`TurnSpan` types for the engine.
 *
 * Fail-open: with no Langfuse credentials configured, `startCallTrace` returns a
 * no-op trace whose methods do nothing — the engine can call it unconditionally.
 * See `tracer.ts` for the precise wiring guide.
 */

export {
  startCallTrace,
  isEnabled as isVoiceTracingEnabled,
  shutdownVoiceTracing,
} from './tracer';

export type {
  CallTrace,
  TurnSpan,
  StartCallTraceInput,
  CallTraceSummary,
  CallTraceDisposition,
  CallDirection,
} from './tracer';

export {
  resolveLangfuseCredentials,
  hasLangfuseCredentials,
  envLangfuseCredentials,
} from './config';

export type {
  LangfuseCredentials,
  LangfuseCredentialOverride,
} from './config';
