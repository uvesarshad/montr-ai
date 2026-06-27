/**
 * YouTube transcribe processor — pulls the auto-caption / manual transcript for
 * a given YouTube video and returns it as concatenated text plus segments.
 *
 * Config:
 *   url: string                — YouTube watch URL or short youtu.be URL (required)
 *   videoId?: string           — alternative to url
 *   lang?: string              — preferred language code (e.g. "en")
 *   maxChars?: number          — cap on returned text length (default 50k)
 */

import { YoutubeTranscript } from 'youtube-transcript';
import { NodeProcessor, NodeProcessorContext } from '../index';

const DEFAULT_MAX_CHARS = 50_000;

function extractVideoId(input: string): string | null {
  if (!input) return null;
  // Already an ID (11 chars, base64-url-ish)
  if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;
  try {
    const u = new URL(input);
    if (u.hostname.endsWith('youtu.be')) {
      const id = u.pathname.replace(/^\/+/, '').split('/')[0];
      return id || null;
    }
    if (u.hostname.endsWith('youtube.com') || u.hostname.endsWith('youtube-nocookie.com')) {
      const v = u.searchParams.get('v');
      if (v) return v;
      // Shorts / embed paths
      const parts = u.pathname.split('/').filter(Boolean);
      const idx = parts.findIndex(p => p === 'shorts' || p === 'embed' || p === 'live');
      if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
    }
  } catch {
    /* not a URL */
  }
  return null;
}

export class YoutubeTranscribeProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config } = context;
    const rawUrl = String(config.url || config.videoUrl || '').trim();
    const videoId = config.videoId ? String(config.videoId) : extractVideoId(rawUrl);

    if (!videoId) {
      throw new Error('YouTube transcriber: could not determine a video ID from "url" / "videoId".');
    }

    const lang = typeof config.lang === 'string' ? config.lang : undefined;
    const maxChars = Math.max(1000, Math.min(Number(config.maxChars ?? DEFAULT_MAX_CHARS), 200_000));

    let segments: Array<{ text: string; offset?: number; duration?: number }>;
    try {
      segments = (await YoutubeTranscript.fetchTranscript(videoId, lang ? { lang } : undefined)) as Array<{ text: string; offset?: number; duration?: number }>;
    } catch (err: unknown) {
      throw new Error(`YouTube transcriber: ${err instanceof Error ? err.message : String(err)}`);
    }

    const fullText = segments.map(s => s.text).join(' ').replace(/\s+/g, ' ').trim();
    const text = fullText.slice(0, maxChars);

    return {
      videoId,
      lang: lang || null,
      text,
      length: text.length,
      truncated: fullText.length > text.length,
      segmentCount: segments.length,
      segments: segments.slice(0, 500), // bound segment payload
    };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!config.url && !config.videoUrl && !config.videoId) {
      errors.push('Either "url" or "videoId" is required');
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}
