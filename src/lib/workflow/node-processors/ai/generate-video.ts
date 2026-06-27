/**
 * AI Generate Video processor.
 *
 * Wraps the existing Genkit/Veo video flow (`startVideoGeneration` +
 * `checkVideoOperation`) into a single workflow step. The flow is async —
 * Veo returns an operation token which we poll until completion.
 *
 * Config:
 *   prompt: string                — required
 *   aspectRatio?: '16:9' | '9:16' | '1:1'   (default '16:9')
 *   durationSeconds?: number      (default 5, capped 2..8)
 *   model?: string                (default 'veo-3.1')
 *   style?: string                — e.g. 'cinematic', 'natural'
 *   pollIntervalMs?: number       (default 5000)
 *   maxWaitMs?: number            (default 600_000 = 10min)
 *
 * Output: `{ videoUrl, videoKey?, model, creditsUsed, durationSeconds }`.
 * Video returned by the flow is a `data:video/mp4;base64,...` URL — we
 * decode + upload to S3 so downstream nodes get a clean HTTP URL. If S3
 * isn't configured, we return the data URL as-is.
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { startVideoGeneration, checkVideoOperation } from '../../../../ai/flows/generate-video-flow';

const DEFAULT_POLL_MS = 5_000;
const DEFAULT_MAX_WAIT_MS = 10 * 60 * 1000;

export class GenerateVideoProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, execution } = context;

    const prompt = String(config.prompt ?? '').trim();
    if (!prompt) throw new Error('Generate Video: "prompt" is required');

    const aspectRatio = String(config.aspectRatio || '16:9');
    const durationSeconds = Math.max(
      2,
      Math.min(Number(config.durationSeconds) || 5, 8)
    );
    const model = config.model || 'veo-3.1';
    const style = config.style;

    const pollIntervalMs = Math.max(
      1_000,
      Number(config.pollIntervalMs) || DEFAULT_POLL_MS
    );
    const maxWaitMs = Math.max(
      30_000,
      Number(config.maxWaitMs) || DEFAULT_MAX_WAIT_MS
    );

    const start = await startVideoGeneration({
      prompt,
      aspectRatio,
      durationSeconds,
      model,
      style,
      userApiKeys: undefined,
    } as Parameters<typeof startVideoGeneration>[0]);

    let operation = start.operation;
    const creditsUsed = start.creditsUsed;

    const deadline = Date.now() + maxWaitMs;
    let videoDataUrl: string | undefined;
    let lastError: string | undefined;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      const status = await checkVideoOperation({
        operation,
        userApiKeys: undefined,
      } as Parameters<typeof checkVideoOperation>[0]);

      if (status.operation) operation = status.operation;

      if (status.done) {
        if (status.error) {
          lastError = status.error;
          break;
        }
        videoDataUrl = status.videoUrl;
        break;
      }
    }

    if (!videoDataUrl) {
      throw new Error(
        lastError
          ? `Generate Video: ${lastError}`
          : `Generate Video: timed out after ${Math.round(maxWaitMs / 1000)}s`
      );
    }

    let videoUrl = videoDataUrl;
    let videoKey: string | undefined;

    // Decode base64 and push to S3 for a clean URL — data URLs are huge for video.
    const match = /^data:video\/([a-z0-9]+);base64,(.*)$/i.exec(videoDataUrl);
    if (match) {
      const [, ext, b64] = match;
      const buffer = Buffer.from(b64, 'base64');
      try {
        const { uploadFile, generateUserFileKey } = await import('@/lib/storage/upload');
        const key = generateUserFileKey(
          String(execution.userId),
          `canvas-video/${execution._id}-${Date.now()}.${ext}`
        );
        const result = await uploadFile({
          buffer,
          key,
          contentType: `video/${ext}`,
        });
        videoUrl = result.url;
        videoKey = result.key;
      } catch {
        // Storage unavailable — keep the data URL. Downstream nodes may
        // struggle with very large payloads, but we'd rather not lose work.
      }
    }

    await execution.updateVariable('ai_video_url', videoUrl).catch(() => {});

    return {
      success: true,
      videoUrl,
      videoKey,
      model,
      aspectRatio,
      durationSeconds,
      creditsUsed,
    };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!config.prompt || !String(config.prompt).trim()) errors.push('prompt is required');
    if (
      config.aspectRatio &&
      !['16:9', '9:16', '1:1', '4:3', '3:4'].includes(String(config.aspectRatio))
    ) {
      errors.push('aspectRatio must be one of 16:9, 9:16, 1:1, 4:3, 3:4');
    }
    if (config.durationSeconds !== undefined) {
      const d = Number(config.durationSeconds);
      if (!Number.isFinite(d) || d < 2 || d > 8) {
        errors.push('durationSeconds must be between 2 and 8');
      }
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}
