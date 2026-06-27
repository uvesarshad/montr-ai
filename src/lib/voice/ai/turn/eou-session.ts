/**
 * End-of-utterance (EOU) inference session — LiveKit turn-detector model.
 *
 * Wraps the `livekit/turn-detector` ONNX classifier (`model_q8.onnx`, rev
 * `v1.2.2-en`) + its HuggingFace tokenizer to predict P(the user's turn is
 * complete) from the recent conversation. Ported faithfully from LiveKit's
 * `agents-js` `livekit` plugin (`turn_detector/base.ts`): normalize text →
 * chat-template → strip the trailing `<|im_end|>` → tokenize (≤128, left-trunc)
 * → run → take the model's single `prob` output.
 *
 * A turn ends EARLY when the score clears a per-language threshold
 * (`languages.json`, en = 0.0289); otherwise the caller waits out the silence
 * window. The model is the *fast-path* — never the only signal — so a low score
 * just means "let the silence timeout decide", which is safe.
 *
 * Assets:
 *  - Tokenizer (small) is bundled at `models/turn-detector-en/` and loaded
 *    offline via transformers.js (`local_files_only`).
 *  - The 65 MB `model_q8.onnx` is NOT committed; it is fetched on first load to
 *    `models/model_q8.onnx` (sha256-verified) or supplied via VOICE_EOU_MODEL_PATH.
 *    Pre-fetch in CI/Docker with `npm run download-voice-models`.
 *
 * One shared singleton serves all calls (the tokenizer + session are stateless
 * across utterances); inference is serialized through a promise chain.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';

import { Tensor, type InferenceSession } from 'onnxruntime-node';

export interface EouMessage {
  role: 'user' | 'assistant';
  content: string;
}

const MAX_HISTORY_TOKENS = 128;
const MAX_HISTORY_TURNS = 6;

/** Bundled tokenizer dir + downloaded model live here. */
function modelsDir(): string {
  return path.resolve(process.cwd(), 'src/lib/voice/ai/turn/models');
}
function defaultModelPath(): string {
  return process.env.VOICE_EOU_MODEL_PATH ?? path.join(modelsDir(), 'model_q8.onnx');
}

/** HF source + integrity for the (uncommitted) ONNX model. */
const MODEL_URL =
  'https://huggingface.co/livekit/turn-detector/resolve/v1.2.2-en/onnx/model_q8.onnx';
const MODEL_SHA256 = 'fdd695a99bda01155fb0b5ce71d34cb9fd3902c62496db7a6c2c7bdeac310ac7';

/** Normalize text exactly like the model's training data (LiveKit `normalizeText`). */
export function normalizeEouText(text: string): string {
  if (!text) return '';
  let s = text.toLowerCase().normalize('NFKC');
  s = Array.from(s)
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      const isPunct =
        (code >= 0x21 && code <= 0x2f) ||
        (code >= 0x3a && code <= 0x40) ||
        (code >= 0x5b && code <= 0x60) ||
        (code >= 0x7b && code <= 0x7e) ||
        (code >= 0xa0 && code <= 0xbf) ||
        (code >= 0x2000 && code <= 0x206f) ||
        (code >= 0x3000 && code <= 0x303f);
      return !(isPunct && ch !== "'" && ch !== '-');
    })
    .join('');
  return s.replace(/\s+/g, ' ').trim();
}

/** Download the model to `dest` (following redirects) and verify its sha256. */
async function ensureModelFile(dest: string): Promise<boolean> {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1_000_000) return true;
  try {
    const res = await fetch(MODEL_URL, { redirect: 'follow' });
    if (!res.ok || !res.body) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    if (sha !== MODEL_SHA256) {
      console.error(`[eou] model sha256 mismatch (got ${sha}) — refusing to use it.`);
      return false;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    return true;
  } catch (err) {
    console.error('[eou] model download failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

interface TransformersTokenizer {
  apply_chat_template(
    messages: EouMessage[],
    opts: { add_generation_prompt: boolean; tokenize: boolean },
  ): string;
  encode(text: string, opts: { add_special_tokens: boolean }): number[];
}

export class EouSession {
  private tokenizer: TransformersTokenizer | null = null;
  private session: InferenceSession | null = null;
  private thresholds: Record<string, { threshold: number }> = {};
  private ready = false;
  private loading: Promise<boolean> | null = null;
  private chain: Promise<void> = Promise.resolve();

  isReady(): boolean {
    return this.ready;
  }

  /** Load tokenizer + model once. Idempotent; safe to await from many callers. */
  load(): Promise<boolean> {
    if (this.ready) return Promise.resolve(true);
    if (!this.loading) this.loading = this.doLoad();
    return this.loading;
  }

  private async doLoad(): Promise<boolean> {
    try {
      // Lazy ESM import so the heavy dep is only touched in a worker process.
      const tf = await import('@huggingface/transformers');
      tf.env.allowRemoteModels = false;
      tf.env.allowLocalModels = true;
      tf.env.localModelPath = modelsDir();

      const modelPath = defaultModelPath();
      if (!(await ensureModelFile(modelPath))) return false;

      const { InferenceSession: ORTSession } = await import('onnxruntime-node');
      this.session = await ORTSession.create(modelPath, {
        executionProviders: [{ name: 'cpu' }],
        interOpNumThreads: 1,
        intraOpNumThreads: Math.max(1, Math.floor((os.cpus().length || 2) / 2)),
      });
      this.tokenizer = (await tf.AutoTokenizer.from_pretrained('turn-detector-en', {
        local_files_only: true,
      })) as unknown as TransformersTokenizer;

      // Per-language thresholds (bundled).
      try {
        const langs = JSON.parse(
          fs.readFileSync(path.join(modelsDir(), 'languages.json'), 'utf8'),
        );
        this.thresholds = langs;
      } catch {
        this.thresholds = { en: { threshold: 0.0289 }, english: { threshold: 0.0289 } };
      }

      this.ready = true;
      return true;
    } catch (err) {
      console.warn(
        '[eou] turn-detector model unavailable — falling back to heuristic. '
        + (err instanceof Error ? err.message : String(err)),
      );
      this.ready = false;
      return false;
    }
  }

  /** EOU threshold for a language code (e.g. 'en', 'en-US'); undefined if unsupported. */
  thresholdFor(language?: string): number | undefined {
    const lang = (language ?? 'en').toLowerCase();
    return (this.thresholds[lang] ?? this.thresholds[lang.split('-')[0]])?.threshold;
  }

  /**
   * Predict P(end-of-turn) for a conversation (most recent turns). Returns null
   * if the model isn't ready (caller falls back to the heuristic).
   */
  async predictEou(messages: EouMessage[]): Promise<number | null> {
    if (!this.ready || !this.tokenizer || !this.session) return null;
    const tokenizer = this.tokenizer;
    const session = this.session;

    let prob: number | null = null;
    const run = this.chain.then(async () => {
      // Last N turns, normalized, with adjacent same-role turns merged.
      const trimmed = messages.slice(-MAX_HISTORY_TURNS);
      const merged: EouMessage[] = [];
      for (const msg of trimmed) {
        if (!msg.content) continue;
        const content = normalizeEouText(msg.content);
        const last = merged[merged.length - 1];
        if (last && last.role === msg.role) last.content += ` ${content}`;
        else merged.push({ role: msg.role, content });
      }
      if (!merged.length) return;

      let text = tokenizer.apply_chat_template(merged, {
        add_generation_prompt: false,
        tokenize: false,
      });
      // Drop the trailing <|im_end|> so the model predicts whether it belongs.
      const ix = text.lastIndexOf('<|im_end|>');
      if (ix >= 0) text = text.slice(0, ix);

      let ids = tokenizer.encode(text, { add_special_tokens: false });
      if (ids.length > MAX_HISTORY_TOKENS) ids = ids.slice(ids.length - MAX_HISTORY_TOKENS); // left-truncate

      const input = new Tensor('int64', BigInt64Array.from(ids.map((n) => BigInt(n))), [1, ids.length]);
      const out = await session.run({ input_ids: input }, ['prob']);
      const data = out.prob.data as Float32Array;
      prob = data[data.length - 1];
    });

    this.chain = run.catch(() => undefined);
    try {
      await run;
    } catch {
      return null;
    }
    return prob;
  }
}

let shared: EouSession | null = null;

/** Process-wide shared EOU session (tokenizer + model loaded once). */
export function getEouSession(): EouSession {
  if (!shared) shared = new EouSession();
  return shared;
}
