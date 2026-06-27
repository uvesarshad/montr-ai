/**
 * Per-call cost estimator (V-9.x).
 *
 * Produces an HONEST ESTIMATE of the all-in cost of a voice call by combining
 * per-minute (telephony, STT), per-1k-char (TTS), and per-1k-token (LLM) rate
 * tables. The result is marked `source: 'estimated'` — it is a planning figure,
 * NOT billing truth. Cost-reconciliation later swaps the telephony leg for the
 * provider's real billed price and flips `source` to 'reconciled'.
 *
 * All rate constants live in the `RATES` block below and are deliberately
 * tunable: they are public list prices as of authoring and will drift. Adjust
 * them there (one place) rather than scattering magic numbers through callers.
 */

import type { ICallCostBreakdown } from '@/lib/db/models/voice/call-session.model';

/**
 * Tunable rate tables. These are ESTIMATES based on public list pricing and are
 * expected to be edited as provider prices change. Keys are matched loosely
 * (case-insensitive substring) against the provider/model id passed in.
 */
const RATES = {
  /** Telephony fallback when no provider rate is supplied (USD / minute). */
  telephonyDefaultPerMinUsd: 0.013, // Twilio US outbound PSTN ~ $0.013/min

  /** STT cost in USD per audio minute, keyed by provider. */
  sttPerMinUsd: {
    deepgram: 0.0043, // Deepgram Nova streaming ~ $0.0043/min
    whisper: 0.006, // OpenAI Whisper ~ $0.006/min
    sarvam: 0.005,
    twilio: 0.05, // Twilio hosted transcription (pricier)
    default: 0.0043,
  } as Record<string, number>,

  /** TTS cost in USD per 1,000 synthesized characters, keyed by provider. */
  ttsPer1kCharsUsd: {
    elevenlabs: 0.18, // ElevenLabs ~ $0.18 / 1k chars (creator tier ballpark)
    openai: 0.015, // OpenAI TTS ~ $15 / 1M chars = $0.015 / 1k
    sarvam: 0.02,
    default: 0.03,
  } as Record<string, number>,

  /**
   * LLM cost in USD per 1,000 tokens, keyed by model. We charge a single
   * blended per-1k-token rate (input+output averaged) for estimation simplicity.
   */
  llmPer1kTokensUsd: {
    'gpt-4o-mini': 0.0004, // ~ $0.15 in / $0.60 out per 1M, blended ~ $0.0004/1k
    'gpt-4o': 0.006,
    'gpt-4.1-mini': 0.0006,
    'claude-haiku': 0.001,
    'claude-sonnet': 0.006,
    'gemini-flash': 0.0003,
    default: 0.0004, // default to a gpt-4o-mini-class rate
  } as Record<string, number>,

  /**
   * Conversation-shape assumptions for char/token estimation. A "turn" is one
   * user→agent exchange. These are rough averages — tune against real traffic.
   */
  avgCharsPerAgentTurn: 180, // spoken agent reply length (chars) → drives TTS
  avgTokensPerTurn: 220, // combined prompt+completion tokens billed per turn
} as const;

/** Loosely match an id against a rate table (case-insensitive substring). */
function lookupRate(
  table: Record<string, number>,
  id: string | undefined,
): number {
  if (!id) return table.default;
  const key = id.toLowerCase();
  for (const [name, rate] of Object.entries(table)) {
    if (name === 'default') continue;
    if (key.includes(name)) return rate;
  }
  return table.default;
}

export interface EstimateCallCostInput {
  /** Billable call duration in seconds. */
  durationSec: number;
  /** Number of completed user→agent turns (drives TTS chars + LLM tokens). */
  turns?: number;
  /** STT provider id (e.g. 'deepgram'). Falls back to the default rate. */
  sttProvider?: string;
  /** TTS provider id (e.g. 'elevenlabs'). Falls back to the default rate. */
  ttsProvider?: string;
  /** LLM model id (e.g. 'gpt-4o-mini'). Falls back to the default rate. */
  llmModel?: string;
  /** Real telephony rate for the call's provider (USD/min) if known. */
  telephonyPerMinuteUsd?: number;
  /** Override average spoken chars per agent turn (defaults to RATES). */
  avgCharsPerTurn?: number;
  /** Override average billed tokens per turn (defaults to RATES). */
  avgTokensPerTurn?: number;
}

/** Round a USD figure to 6 decimal places (sub-cent precision). */
function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * Compute an honest, tunable all-in cost ESTIMATE for a call. The returned
 * breakdown is always `source: 'estimated'`; reconciliation later upgrades it.
 */
export function estimateCallCost(input: EstimateCallCostInput): ICallCostBreakdown {
  const durationSec = Math.max(0, input.durationSec || 0);
  const minutes = durationSec / 60;
  const turns = Math.max(0, input.turns ?? 0);

  const telephonyPerMin = input.telephonyPerMinuteUsd ?? RATES.telephonyDefaultPerMinUsd;
  const telephony = round(minutes * telephonyPerMin);

  const stt = round(minutes * lookupRate(RATES.sttPerMinUsd, input.sttProvider));

  const charsPerTurn = input.avgCharsPerTurn ?? RATES.avgCharsPerAgentTurn;
  const spokenChars = turns * charsPerTurn;
  const tts = round((spokenChars / 1000) * lookupRate(RATES.ttsPer1kCharsUsd, input.ttsProvider));

  const tokensPerTurn = input.avgTokensPerTurn ?? RATES.avgTokensPerTurn;
  const tokens = turns * tokensPerTurn;
  const llm = round((tokens / 1000) * lookupRate(RATES.llmPer1kTokensUsd, input.llmModel));

  const total = round(llm + stt + tts + telephony);

  return { llm, stt, tts, telephony, total, currency: 'USD', source: 'estimated' };
}
