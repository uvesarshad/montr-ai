/**
 * Slideshow → MP4 assembly (Epic 4.3 — AI slideshow→video pipeline).
 *
 * Orchestrates the full pipeline:
 *   1. Per slide: generate the background image via the shared image flow.
 *   2. Per slide: synthesize narration audio via the voice TTS subsystem.
 *   3. Assemble a captioned MP4 with ffmpeg (one slide per narration segment,
 *      cross-fade between slides, captions burned in via drawtext when possible).
 *   4. Upload the MP4 to storage and return a public/presigned URL.
 *
 * Platform rules honoured:
 *   - AI image gen reuses `generateImage()` (never a provider SDK directly).
 *   - TTS reuses `createTTSClient()` from the voice subsystem (OpenAI default).
 *   - Storage via `uploadFile()`; ffmpeg binary comes from the bundled installer
 *     so no system ffmpeg is required.
 *   - Remote image URLs (non-data-URI) are fetched through `safeOutboundFetch`.
 *
 * The ffmpeg invocation is isolated in `renderSlideshowMp4` so the orchestration
 * stays testable, and all temp files are cleaned up in a `finally` block.
 */

import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';

import ffmpegPathPkg from '@ffmpeg-installer/ffmpeg';
import ffmpeg from 'fluent-ffmpeg';

import { generateImage } from '@/ai/flows/generate-image-flow';
import { createTTSClient } from '@/lib/voice/ai/tts/index';
import { uploadFile, generateUserFileKey } from '@/lib/storage/upload';
import { safeOutboundFetch } from '@/lib/workflow/ssrf-guard';
import type { SlideshowSlide } from './script';

// Bind the bundled ffmpeg binary — no system ffmpeg dependency.
ffmpeg.setFfmpegPath(ffmpegPathPkg.path);

/** Fallback per-slide duration (seconds) when narration can't be probed. */
const FALLBACK_SLIDE_SECONDS = 4;
/** Cross-fade duration between consecutive slides (seconds). */
const FADE_SECONDS = 0.5;
/** Output frame size (portrait 9:16, the social default). */
const OUT_WIDTH = 1080;
const OUT_HEIGHT = 1920;
const OUT_FPS = 30;
/** TTS audio params (OpenAI PCM output is 24 kHz, signed 16-bit, mono). */
const TTS_SAMPLE_RATE = 24000;

export interface AssembleSlideshowInput {
    slides: SlideshowSlide[];
    userId: string;
    /** Optional TTS voice id (e.g. 'alloy', 'nova'). */
    voice?: string;
}

export interface AssembleSlideshowResult {
    url: string;
    durationSec: number;
    slideCount: number;
}

export interface RenderSlideshowOptions {
    /** Per-slide display durations (seconds), index-aligned to `localImages`. */
    durations: number[];
    /** Per-slide captions, index-aligned to `localImages`. */
    captions: string[];
}

/** Decode a data URI into { buffer, ext }. */
function parseDataUri(dataUri: string): { buffer: Buffer; ext: string } | null {
    const match = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(dataUri);
    if (!match) return null;
    const mimeType = match[1] || 'image/png';
    const isBase64 = Boolean(match[2]);
    const data = match[3];
    const buffer = isBase64
        ? Buffer.from(data, 'base64')
        : Buffer.from(decodeURIComponent(data), 'utf-8');
    const ext = mimeType.split('/')[1]?.split('+')[0] || 'png';
    return { buffer, ext };
}

/** Resolve a generated image (data URI or remote URL) to a local file. */
async function writeImageToDisk(imageUrl: string, dir: string, index: number): Promise<string> {
    if (imageUrl.startsWith('data:')) {
        const parsed = parseDataUri(imageUrl);
        if (!parsed) throw new Error(`Slide ${index}: unparseable image data URI`);
        const file = path.join(dir, `slide-${index}.${parsed.ext}`);
        await fs.writeFile(file, parsed.buffer);
        return file;
    }
    // Remote URL — fetch through the SSRF guard.
    const res = await safeOutboundFetch(imageUrl);
    if (!res.ok) throw new Error(`Slide ${index}: image fetch failed (${res.status})`);
    const arrayBuf = await res.arrayBuffer();
    const ext = (imageUrl.split('?')[0].split('.').pop() || 'png').slice(0, 5);
    const file = path.join(dir, `slide-${index}.${ext}`);
    await fs.writeFile(file, Buffer.from(arrayBuf));
    return file;
}

/** Wrap raw PCM16 (mono) bytes in a minimal WAV container so ffprobe/ffmpeg can read it. */
function pcm16ToWav(pcm: Buffer, sampleRate: number): Buffer {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcm.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // PCM fmt chunk size
    header.writeUInt16LE(1, 20); // audio format = PCM
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(pcm.length, 40);
    return Buffer.concat([header, pcm]);
}

/** Collect a TTS stream into a single PCM buffer, then a WAV file on disk. */
async function writeNarrationToDisk(
    text: string,
    dir: string,
    index: number,
    voice: string | undefined,
): Promise<string> {
    const tts = createTTSClient({ provider: 'openai', voice });
    const chunks: Uint8Array[] = [];
    // Request PCM16 @ 24 kHz (OpenAI adapter native rate) — leave encoding off
    // so the adapter yields raw PCM rather than μ-law telephony bytes.
    for await (const chunk of tts.stream(text, { encoding: 'pcm16', sampleRate: TTS_SAMPLE_RATE, voice })) {
        if (chunk && chunk.length) chunks.push(chunk);
    }
    const pcm = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    const wav = pcm16ToWav(pcm, TTS_SAMPLE_RATE);
    const file = path.join(dir, `audio-${index}.wav`);
    await fs.writeFile(file, wav);
    return file;
}

/** Probe an audio file's duration in seconds via ffprobe (bundled with fluent-ffmpeg). */
function probeDurationSec(file: string): Promise<number> {
    return new Promise((resolve) => {
        ffmpeg.ffprobe(file, (err, data) => {
            if (err) {
                resolve(FALLBACK_SLIDE_SECONDS);
                return;
            }
            const dur = data?.format?.duration;
            resolve(typeof dur === 'number' && dur > 0 ? dur : FALLBACK_SLIDE_SECONDS);
        });
    });
}

/** Escape a caption string for ffmpeg drawtext (single-line). */
function escapeDrawText(text: string): string {
    return text
        .replace(/\\/g, '\\\\')
        .replace(/:/g, '\\:')
        .replace(/'/g, "’") // curly apostrophe avoids quoting hell
        .replace(/%/g, '\\%')
        .replace(/\n/g, ' ')
        .slice(0, 120);
}

/**
 * Render the final MP4 from local slide images + narration audio.
 *
 * Each slide is shown for the duration of its narration segment, with a short
 * cross-fade between slides. Captions are burned in via the drawtext filter; if
 * the bundled ffmpeg lacks the freetype/drawtext filter the render is retried
 * without captions (logged), so v1 degrades gracefully rather than failing.
 *
 * Isolated here so the orchestration (`assembleSlideshow`) stays testable.
 */
export function renderSlideshowMp4(
    localImages: string[],
    localAudio: string[],
    outPath: string,
    opts: RenderSlideshowOptions,
): Promise<void> {
    const run = (withCaptions: boolean): Promise<void> =>
        new Promise<void>((resolve, reject) => {
            const command = ffmpeg();

            // Each image becomes a looped input clipped to its slide duration.
            localImages.forEach((img, i) => {
                command.input(img).inputOptions(['-loop 1', `-t ${opts.durations[i].toFixed(3)}`]);
            });
            // Then each narration audio file.
            localAudio.forEach((a) => command.input(a));

            const n = localImages.length;
            const filters: string[] = [];

            // Scale/pad every image to the output frame and set fps/sar.
            for (let i = 0; i < n; i++) {
                const cap = withCaptions ? opts.captions[i] : '';
                let chain =
                    `[${i}:v]scale=${OUT_WIDTH}:${OUT_HEIGHT}:force_original_aspect_ratio=increase,` +
                    `crop=${OUT_WIDTH}:${OUT_HEIGHT},setsar=1,fps=${OUT_FPS},format=yuv420p`;
                if (cap) {
                    const text = escapeDrawText(cap);
                    chain +=
                        `,drawtext=text='${text}':fontcolor=white:fontsize=54:` +
                        `box=1:boxcolor=black@0.5:boxborderw=24:` +
                        `x=(w-text_w)/2:y=h-(h/6)`;
                }
                filters.push(`${chain}[v${i}]`);
            }

            // Cross-fade the slide chain together (xfade is sequential).
            let lastLabel = `v0`;
            let accumulated = opts.durations[0];
            for (let i = 1; i < n; i++) {
                const offset = Math.max(0, accumulated - FADE_SECONDS);
                const out = i === n - 1 ? 'vout' : `vx${i}`;
                filters.push(
                    `[${lastLabel}][v${i}]xfade=transition=fade:duration=${FADE_SECONDS}:offset=${offset.toFixed(3)}[${out}]`,
                );
                lastLabel = out;
                accumulated += opts.durations[i] - FADE_SECONDS;
            }
            const videoOut = n === 1 ? 'v0' : 'vout';

            // Concat all narration audio streams into one track.
            const audioInputs = localAudio.map((_, i) => `[${n + i}:a]`).join('');
            filters.push(`${audioInputs}concat=n=${n}:v=0:a=1[aout]`);

            command
                .complexFilter(filters)
                .outputOptions([
                    '-map', `[${videoOut}]`,
                    '-map', '[aout]',
                    '-c:v', 'libx264',
                    '-pix_fmt', 'yuv420p',
                    '-c:a', 'aac',
                    '-b:a', '128k',
                    '-shortest',
                    '-movflags', '+faststart',
                ])
                .on('end', () => resolve())
                .on('error', (err: Error) => reject(err))
                .save(outPath);
        });

    return run(true).catch((err) => {
        // drawtext requires freetype; if unavailable, retry caption-free.
        const msg = String(err?.message || err);
        if (/drawtext|freetype|No such filter/i.test(msg)) {
            console.warn('[slideshow] drawtext unavailable — rendering without burned-in captions:', msg);
            return run(false);
        }
        throw err;
    });
}

/**
 * Full slideshow pipeline: images + narration + ffmpeg assembly + upload.
 * Returns the uploaded MP4 url, total duration, and slide count.
 */
export async function assembleSlideshow(input: AssembleSlideshowInput): Promise<AssembleSlideshowResult> {
    const { slides, userId, voice } = input;
    if (!slides.length) throw new Error('No slides to assemble');

    const workDir = path.join(os.tmpdir(), `montrai-slideshow-${randomUUID()}`);
    await fs.mkdir(workDir, { recursive: true });

    try {
        // 1. Generate images + narration per slide (images sequential to respect
        //    AI rate limits / credit checks inside the flow).
        const localImages: string[] = [];
        const localAudio: string[] = [];
        for (let i = 0; i < slides.length; i++) {
            const slide = slides[i];
            const img = await generateImage({ prompt: slide.imagePrompt, aspectRatio: '9:16' });
            if (!img?.imageUrl) throw new Error(`Slide ${i}: image generation returned no image`);
            localImages.push(await writeImageToDisk(img.imageUrl, workDir, i));
            localAudio.push(await writeNarrationToDisk(slide.narration, workDir, i, voice));
        }

        // 2. Probe each narration's duration → slide display durations.
        const durations: number[] = [];
        for (const audio of localAudio) {
            const dur = await probeDurationSec(audio);
            // Pad a little so the slide doesn't cut on the last word.
            durations.push(Math.max(FALLBACK_SLIDE_SECONDS, dur + 0.4));
        }

        // 3. Render the MP4.
        const outPath = path.join(workDir, 'slideshow.mp4');
        await renderSlideshowMp4(localImages, localAudio, outPath, {
            durations,
            captions: slides.map((s) => s.caption),
        });

        // 4. Upload.
        const mp4 = await fs.readFile(outPath);
        const key = generateUserFileKey(userId, `social/slideshow-${Date.now()}.mp4`);
        const upload = await uploadFile({ buffer: mp4, key, contentType: 'video/mp4' });

        const durationSec = durations.reduce((a, b) => a + b, 0) - FADE_SECONDS * (slides.length - 1);

        return {
            url: upload.url,
            durationSec: Math.round(durationSec * 10) / 10,
            slideCount: slides.length,
        };
    } finally {
        // Always clean up temp files.
        await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
}
