/**
 * Post-call disposition / sentiment analyzer.
 *
 * One LLM pass over a finished call transcript that returns a structured
 * disposition (outcome / sentiment / category / notes) for persistence on
 * `call_session.disposition`. Runs from the webhook `call.completed` handler
 * after the transcript is ready.
 *
 * Like the rest of the voice subsystem, all LLM calls route through
 * `generateTextWithClient` (`src/ai/client.ts`) — never a provider SDK. The
 * model defaults to the same `VOICE_LLM_MODEL` the live agent uses, with a
 * per-call override available.
 *
 * Never throws: parse/transport failures return `null` so the caller simply
 * leaves the disposition unset.
 *
 * 🔒 `organizationId` is taken from the trusted caller (session/DB-derived) and
 * only passed through; this function never reads it from external input.
 */

import { generateTextWithClient } from '@/ai/client';

/** Allowed disposition outcomes (mirrors `ICallDisposition.outcome`). */
const OUTCOMES = [
  'connected',
  'voicemail',
  'no_answer',
  'busy',
  'failed',
  'declined',
] as const;
type Outcome = (typeof OUTCOMES)[number];

/** Allowed sentiment values (mirrors `ICallDisposition.sentiment`). */
const SENTIMENTS = ['positive', 'neutral', 'negative'] as const;
type Sentiment = (typeof SENTIMENTS)[number];

/** Default LLM model — matches the live voice agent (`ws-handler` / `call-worker`). */
const DEFAULT_MODEL = process.env.VOICE_LLM_MODEL ?? 'gpt-4o-mini';

export interface DispositionAnalysis {
  outcome: Outcome;
  sentiment: Sentiment;
  /** Short AI-classified intent/topic, e.g. 'booking', 'complaint', 'not-interested'. */
  category?: string;
  /** 1-2 sentence summary of the call. */
  notes?: string;
}

const SYSTEM_PROMPT = `You are a call-center analyst. You classify the disposition of a phone call from its transcript.

Respond with STRICT JSON only — no prose, no markdown, no code fences. The object must have exactly these fields:
{
  "outcome": one of "connected" | "voicemail" | "no_answer" | "busy" | "failed" | "declined",
  "sentiment": one of "positive" | "neutral" | "negative",
  "category": a short lowercase intent/topic label (1-3 words, e.g. "booking", "complaint", "not-interested", "support", "sales"),
  "notes": a 1-2 sentence plain-language summary of what happened on the call
}

Guidance:
- "connected" means a real two-way human/agent conversation took place.
- "voicemail" means the call reached a voicemail/answering machine.
- "no_answer", "busy", "failed", "declined" describe calls that did not reach a real conversation.
- "sentiment" reflects the overall tone of the contact toward the outcome (default "neutral" when unclear).
- Keep "notes" factual and concise. If the transcript is too thin to judge, say so briefly.`;

/** Pull the first balanced {...} block out of a model response (tolerates fences/prose). */
function extractJsonObject(raw: string): string | null {
  if (!raw) return null;
  // Strip ```json ... ``` / ``` ... ``` fences if present.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : raw).trim();

  const start = body.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return body.slice(start, i + 1);
    }
  }
  return null;
}

function coerceOutcome(value: unknown): Outcome {
  return typeof value === 'string' && (OUTCOMES as readonly string[]).includes(value)
    ? (value as Outcome)
    : 'connected';
}

function coerceSentiment(value: unknown): Sentiment {
  return typeof value === 'string' && (SENTIMENTS as readonly string[]).includes(value)
    ? (value as Sentiment)
    : 'neutral';
}

function coerceString(value: unknown, maxLen: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

/**
 * Map a call end-reason hint to a non-conversational outcome, when it implies
 * the call never reached a real conversation. Returns `null` for hints that
 * don't force an outcome (e.g. 'completed', 'hangup_by_callee').
 */
function outcomeFromEndReason(hint?: string): Outcome | null {
  if (!hint) return null;
  const h = hint.toLowerCase();
  if (h.includes('voicemail') || h.includes('machine')) return 'voicemail';
  if (h.includes('no-answer') || h.includes('no_answer') || h.includes('noanswer')) return 'no_answer';
  if (h.includes('busy')) return 'busy';
  if (h.includes('cancel') || h.includes('declined') || h.includes('reject')) return 'declined';
  if (h.includes('fail') || h.includes('error') || h.includes('timeout')) return 'failed';
  return null;
}

/**
 * Analyze a finished call transcript and return a structured disposition.
 *
 * Cheap path: when the transcript is empty/blank and `endReasonHint` implies a
 * non-conversational outcome (voicemail/no-answer/busy/failed/declined), the
 * outcome is returned directly without invoking the LLM.
 *
 * Returns `null` on empty-with-no-useful-hint, parse failure, or any error —
 * never throws.
 */
export async function analyzeCallDisposition(input: {
  transcriptText: string;
  userId?: string;
  /** e.g. 'voicemail' | 'no-answer' — biases / short-circuits the outcome. */
  endReasonHint?: string;
  model?: string;
}): Promise<DispositionAnalysis | null> {
  try {
    const transcript = (input.transcriptText ?? '').trim();
    const hintOutcome = outcomeFromEndReason(input.endReasonHint);

    // Cheap path: no transcript to reason over. Use the hint if it tells us the
    // call never connected; otherwise we have nothing to classify → null.
    if (!transcript) {
      if (hintOutcome && hintOutcome !== 'connected') {
        return { outcome: hintOutcome, sentiment: 'neutral' };
      }
      return null;
    }

    // Cap the transcript so we don't blow the prompt budget on long calls.
    const MAX_TRANSCRIPT_CHARS = 12000;
    const clipped =
      transcript.length > MAX_TRANSCRIPT_CHARS
        ? transcript.slice(0, MAX_TRANSCRIPT_CHARS) + '\n…[transcript truncated]'
        : transcript;

    const hintLine = input.endReasonHint
      ? `\n\nProvider end-reason hint (bias the outcome toward this when consistent): ${input.endReasonHint}`
      : '';

    const userContent =
      `Classify the following call transcript and respond with the strict JSON object described.${hintLine}\n\n` +
      `--- TRANSCRIPT START ---\n${clipped}\n--- TRANSCRIPT END ---`;

    const reply = await generateTextWithClient({
      model: input.model ?? DEFAULT_MODEL,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
      userProfile: null,
      userPlan: null,
      routeHint: null,
      temperature: 0.2,
      maxTokens: 200,
    });

    const jsonStr = extractJsonObject(reply);
    if (!jsonStr) {
      // Couldn't recover JSON. Fall back to the hint outcome if it's decisive.
      if (hintOutcome && hintOutcome !== 'connected') {
        return { outcome: hintOutcome, sentiment: 'neutral' };
      }
      return null;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    } catch {
      if (hintOutcome && hintOutcome !== 'connected') {
        return { outcome: hintOutcome, sentiment: 'neutral' };
      }
      return null;
    }

    // A decisive non-conversational hint overrides whatever the model guessed
    // for outcome (the model can't see provider call signaling).
    const outcome =
      hintOutcome && hintOutcome !== 'connected'
        ? hintOutcome
        : coerceOutcome(parsed.outcome);

    const result: DispositionAnalysis = {
      outcome,
      sentiment: coerceSentiment(parsed.sentiment),
    };
    const category = coerceString(parsed.category, 80);
    if (category) result.category = category;
    const notes = coerceString(parsed.notes, 500);
    if (notes) result.notes = notes;

    return result;
  } catch (error) {
    console.warn(
      '[voice] analyzeCallDisposition failed:',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
