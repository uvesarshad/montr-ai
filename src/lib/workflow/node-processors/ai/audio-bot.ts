/**
 * Audio Bot processor — voice AI.
 *
 * Modes:
 *  - tts (default):           text → speech via OpenAI /audio/speech
 *  - voice_clone:             not supported by the default OpenAI provider;
 *                             returns a clear error pointing at external providers.
 *  - podcast:                 longform TTS — same as tts but enforces a soft
 *                             length cap and splits >4096-char scripts into
 *                             chunks rendered sequentially then concatenated.
 *
 * Output: `{ audioUrl, audioKey, durationEstimateMs, voice, model }`
 *
 * Audio is uploaded to S3 (presigned URL returned) when credentials are set,
 * otherwise returned inline as a base64 data URL.
 */

import { NodeProcessor, NodeProcessorContext } from '../index';

const OPENAI_SPEECH_URL = 'https://api.openai.com/v1/audio/speech';
const ALLOWED_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;
const MAX_CHARS_PER_REQ = 4096;
const MAX_TOTAL_CHARS = 20_000;

type Mode = 'tts' | 'voice_clone' | 'podcast';

export class AudioBotProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, execution } = context;

    const mode: Mode = (config.mode as Mode) || 'tts';
    if (mode === 'voice_clone') {
      throw new Error(
        'Audio Bot: voice cloning is not supported by the default provider. Configure an external voice provider (ElevenLabs, etc.) on this node.'
      );
    }

    const script = String(config.script ?? '').trim();
    if (!script) throw new Error('Audio Bot: "script" is required');
    if (script.length > MAX_TOTAL_CHARS) {
      throw new Error(
        `Audio Bot: script exceeds ${MAX_TOTAL_CHARS} characters (got ${script.length})`
      );
    }

    const rawVoice = config.voice as string | undefined;
    const voice = (rawVoice && ALLOWED_VOICES.includes(rawVoice as (typeof ALLOWED_VOICES)[number]))
      ? (rawVoice as (typeof ALLOWED_VOICES)[number])
      : 'alloy';
    const speed = Math.max(0.5, Math.min(Number(config.speed) || 1.0, 2.0));
    const model = String(config.model || 'tts-1');

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('Audio Bot: OPENAI_API_KEY env var is not configured');
    }

    // Split into chunks (podcast / long scripts)
    const chunks =
      mode === 'podcast' || script.length > MAX_CHARS_PER_REQ
        ? splitForTTS(script, MAX_CHARS_PER_REQ)
        : [script];

    const buffers: Buffer[] = [];
    for (const chunk of chunks) {
      const res = await fetch(OPENAI_SPEECH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          voice,
          input: chunk,
          speed,
          response_format: 'mp3',
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        const errTxt = await res.text().catch(() => '');
        throw new Error(`Audio Bot: TTS failed (${res.status}) — ${errTxt.slice(0, 400)}`);
      }
      buffers.push(Buffer.from(await res.arrayBuffer()));
    }

    const audioBuffer = Buffer.concat(buffers);
    // Rough duration estimate: 140 wpm ≈ 2.33 words/sec ≈ 4.5 char/sec.
    const durationEstimateMs = Math.round((script.length / 15) * 1000);

    // Try S3 upload for a clean URL; fall back to data URL if storage isn't set up.
    let audioUrl: string;
    let audioKey: string | undefined;
    try {
      const { uploadFile, generateUserFileKey } = await import('@/lib/storage/upload');
      const key = generateUserFileKey(
        String(execution.userId),
        `canvas-audio/${execution._id}-${Date.now()}.mp3`
      );
      const result = await uploadFile({
        buffer: audioBuffer,
        key,
        contentType: 'audio/mpeg',
      });
      audioUrl = result.url;
      audioKey = result.key;
    } catch (_err) {
      // Storage not configured — return inline base64 (size-capped)
      if (audioBuffer.length > 5 * 1024 * 1024) {
        throw new Error(
          'Audio Bot: storage upload failed and audio is too large for inline return (>5MB). Configure S3.'
        );
      }
      audioUrl = `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`;
    }

    return {
      success: true,
      audioUrl,
      audioKey,
      voice,
      model,
      mode,
      chunks: chunks.length,
      sizeBytes: audioBuffer.length,
      durationEstimateMs,
    };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!config.script || !String(config.script).trim()) errors.push('script is required');
    if (config.mode && !['tts', 'voice_clone', 'podcast'].includes(String(config.mode))) {
      errors.push('mode must be tts, voice_clone, or podcast');
    }
    if (config.voice && !ALLOWED_VOICES.includes(String(config.voice) as (typeof ALLOWED_VOICES)[number])) {
      errors.push(`voice must be one of: ${ALLOWED_VOICES.join(', ')}`);
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}

/**
 * Split a long script at sentence boundaries so each chunk fits under the
 * per-request char limit. Falls back to hard slicing if a "sentence" is too
 * long.
 */
function splitForTTS(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = '';
  for (const s of sentences) {
    if ((current + ' ' + s).length > maxChars) {
      if (current) chunks.push(current.trim());
      if (s.length > maxChars) {
        for (let i = 0; i < s.length; i += maxChars) {
          chunks.push(s.slice(i, i + maxChars));
        }
        current = '';
      } else {
        current = s;
      }
    } else {
      current = current ? current + ' ' + s : s;
    }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}
