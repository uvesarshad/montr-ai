/**
 * Audio Transcribe processor — OpenAI Whisper.
 *
 * Fetches the audio (URL or data URI), posts it as multipart/form-data to
 * OpenAI's /audio/transcriptions endpoint, returns the transcript.
 *
 * Config:
 *   audioUrl: string                — required. http(s) URL or data:audio URI
 *   language?: string               — ISO 639-1 (e.g. 'en', 'hi'). Omitted = auto
 *   model?: string                  — default 'whisper-1'
 *   responseFormat?: 'json'|'text'|'verbose_json'|'srt'|'vtt' (default 'json')
 *   prompt?: string                 — optional guidance / glossary
 *   temperature?: number            — 0..1 (default 0)
 *   translate?: boolean             — if true, uses /translations (→ English)
 *
 * Output: `{ text, language?, duration?, segments?, format, model }`
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { safeOutboundFetch } from '../../ssrf-guard';

const OPENAI_BASE = 'https://api.openai.com/v1/audio';
const MAX_BYTES = 25 * 1024 * 1024; // Whisper file size cap

type ResponseFormat = 'json' | 'text' | 'verbose_json' | 'srt' | 'vtt';
const VALID_FORMATS: readonly ResponseFormat[] = [
  'json',
  'text',
  'verbose_json',
  'srt',
  'vtt',
];

export class AudioTranscribeProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config } = context;

    const audioUrl = String(config.audioUrl ?? '').trim();
    if (!audioUrl) throw new Error('Audio Transcribe: "audioUrl" is required');

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('Audio Transcribe: OPENAI_API_KEY is not configured');

    const model = String(config.model || 'whisper-1');
    const rawFormat = config.responseFormat as string | undefined;
    const responseFormat: ResponseFormat = (rawFormat && VALID_FORMATS.includes(rawFormat as ResponseFormat))
      ? (rawFormat as ResponseFormat)
      : 'json';
    const translate = !!config.translate;
    const temperature = Math.max(0, Math.min(Number(config.temperature) || 0, 1));

    // Fetch the audio
    const { buffer, contentType, filename } = await loadAudio(audioUrl);
    if (buffer.length > MAX_BYTES) {
      throw new Error(
        `Audio Transcribe: file exceeds Whisper's 25MB limit (got ${Math.round(
          buffer.length / 1_048_576
        )}MB)`
      );
    }

    const form = new FormData();
    // Buffer -> Uint8Array for BlobPart typing; the underlying bytes are the same.
    form.append(
      'file',
      new Blob([new Uint8Array(buffer)], { type: contentType }),
      filename
    );
    form.append('model', model);
    form.append('response_format', responseFormat);
    if (temperature) form.append('temperature', String(temperature));
    if (config.prompt) form.append('prompt', String(config.prompt));
    if (!translate && config.language) form.append('language', String(config.language));

    const endpoint = translate
      ? `${OPENAI_BASE}/translations`
      : `${OPENAI_BASE}/transcriptions`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      const errTxt = await res.text().catch(() => '');
      throw new Error(
        `Audio Transcribe: Whisper failed (${res.status}) — ${errTxt.slice(0, 400)}`
      );
    }

    // Response shape varies by format
    if (responseFormat === 'json' || responseFormat === 'verbose_json') {
      const data = await res.json() as Record<string, unknown>;
      return {
        success: true,
        text: data.text ?? '',
        language: data.language,
        duration: data.duration,
        segments: data.segments,
        format: responseFormat,
        model,
        translated: translate,
      };
    }

    const text = await res.text();
    return {
      success: true,
      text,
      format: responseFormat,
      model,
      translated: translate,
    };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!config.audioUrl) errors.push('audioUrl is required');
    if (config.responseFormat && !VALID_FORMATS.includes(config.responseFormat as ResponseFormat)) {
      errors.push(`responseFormat must be one of: ${VALID_FORMATS.join(', ')}`);
    }
    if (config.temperature !== undefined) {
      const t = Number(config.temperature);
      if (!Number.isFinite(t) || t < 0 || t > 1) {
        errors.push('temperature must be between 0 and 1');
      }
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}

/**
 * Load audio from a URL (http(s) — SSRF-guarded) or an inline data URI.
 */
async function loadAudio(
  source: string
): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
  const dataMatch = /^data:(audio\/[\w+.-]+);base64,(.*)$/i.exec(source);
  if (dataMatch) {
    const [, contentType, b64] = dataMatch;
    const ext = contentType.split('/')[1]?.split(';')[0] || 'mp3';
    return {
      buffer: Buffer.from(b64, 'base64'),
      contentType,
      filename: `audio.${ext}`,
    };
  }

  const res = await safeOutboundFetch(source, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) {
    throw new Error(`Audio Transcribe: failed to fetch audio (${res.status})`);
  }
  const contentType = res.headers.get('content-type') || 'audio/mpeg';
  const buffer = Buffer.from(await res.arrayBuffer());
  const urlPath = new URL(source).pathname;
  const filename = urlPath.split('/').pop() || 'audio.mp3';
  return { buffer, contentType, filename };
}
