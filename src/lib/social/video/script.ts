/**
 * Slideshow script generation (Epic 4.3 — AI slideshow→video pipeline).
 *
 * Turns a free-text topic / brief into an ordered list of slides, where each
 * slide carries the on-screen caption, the AI image prompt used to render its
 * background, and the narration line spoken over it. The downstream
 * `assembleSlideshow` step consumes this exact shape.
 *
 * All AI calls go through the shared `src/ai/client.ts` (per platform rules) —
 * we never touch a provider SDK directly. The model + BYOK keys are resolved
 * from the requesting user's AI preferences, mirroring `social/autopost.ts`.
 */

import { generateTextWithClient } from '@/ai/client';
import { AISettingsService } from '@/lib/services/ai-settings.service';
import { userRepository } from '@/lib/db/repository/user.repository';
import { loadBrandProfile } from '@/lib/social/brand-access';
import { buildBrandProfileNote } from '@/ai/types';

/** A single slide in the generated slideshow. */
export interface SlideshowSlide {
    /** Short on-screen caption (burned in as a subtitle when supported). */
    caption: string;
    /** Image-generation prompt for this slide's background visual. */
    imagePrompt: string;
    /** Narration line spoken over this slide (drives slide duration). */
    narration: string;
}

export interface GenerateSlideshowScriptInput {
    /** Topic, brief, or full script text to base the slideshow on. */
    topic: string;
    /** Owner of the source — used to resolve AI prefs + BYOK keys. */
    userId: string;
    /** Optional brand for brand-voice-aware copy. */
    brandId?: string;
    /** Desired number of slides (clamped 2..10). Default 5. */
    slideCount?: number;
}

export interface GenerateSlideshowScriptResult {
    slides: SlideshowSlide[];
}

const MIN_SLIDES = 2;
const MAX_SLIDES = 10;

function clampSlideCount(n: number | undefined): number {
    if (!n || Number.isNaN(n)) return 5;
    return Math.max(MIN_SLIDES, Math.min(MAX_SLIDES, Math.round(n)));
}

/**
 * Best-effort extraction of a JSON array/object from a model response that may
 * be wrapped in prose or ```json fences.
 */
function extractJson(raw: string): unknown {
    const trimmed = raw.trim();
    // Strip code fences if present.
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = fenced ? fenced[1].trim() : trimmed;
    // Grab the first {...} or [...] block.
    const start = body.search(/[[{]/);
    if (start === -1) throw new Error('No JSON found in model response');
    const open = body[start];
    const close = open === '[' ? ']' : '}';
    const end = body.lastIndexOf(close);
    if (end === -1 || end < start) throw new Error('Malformed JSON in model response');
    const slice = body.slice(start, end + 1);
    return JSON.parse(slice);
}

function coerceSlides(parsed: unknown, max: number): SlideshowSlide[] {
    // Accept either a bare array or `{ slides: [...] }`.
    const arr = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as { slides?: unknown })?.slides)
            ? (parsed as { slides: unknown[] }).slides
            : null;
    if (!arr) throw new Error('Model response did not contain a slides array');

    const slides: SlideshowSlide[] = [];
    for (const item of arr) {
        if (slides.length >= max) break;
        if (!item || typeof item !== 'object') continue;
        const rec = item as Record<string, unknown>;
        const caption = String(rec.caption ?? rec.title ?? '').trim();
        const imagePrompt = String(rec.imagePrompt ?? rec.image ?? rec.visual ?? '').trim();
        const narration = String(rec.narration ?? rec.voiceover ?? rec.script ?? caption).trim();
        if (!caption && !imagePrompt && !narration) continue;
        slides.push({
            caption: caption || narration.slice(0, 80),
            imagePrompt: imagePrompt || caption || narration,
            narration: narration || caption,
        });
    }
    if (slides.length === 0) throw new Error('No usable slides parsed from model response');
    return slides;
}

/**
 * Generate an ordered slideshow script from a topic/brief via the AI client.
 * Returns `{ slides }`. Throws on AI failure or unparseable output.
 */
export async function generateSlideshowScript(
    input: GenerateSlideshowScriptInput,
): Promise<GenerateSlideshowScriptResult> {
    const { topic, userId, brandId } = input;
    const slideCount = clampSlideCount(input.slideCount);

    const [pref, user, brandProfile] = await Promise.all([
        AISettingsService.getPreferredModel(userId, 'socialAssistant'),
        userRepository.findById(userId),
        brandId ? loadBrandProfile(brandId) : Promise.resolve(undefined),
    ]);

    const userApiKeys = user
        ? {
              openai: user.openaiApiKey || process.env.OPENAI_API_KEY,
              anthropic: user.anthropicApiKey || process.env.ANTHROPIC_API_KEY,
              google: user.googleApiKey || process.env.GEMINI_API_KEY,
              openrouter: user.openrouterApiKey || process.env.OPENROUTER_API_KEY,
          }
        : undefined;

    const brandNote = buildBrandProfileNote(brandProfile);

    const system = `You are a short-form video scriptwriter who turns a topic into a captioned slideshow.
Produce exactly ${slideCount} slides that tell a coherent, engaging story in sequence.${brandNote}

For EACH slide provide:
- "caption": a punchy on-screen caption (max ~12 words) — this is burned onto the slide.
- "imagePrompt": a vivid, self-contained image-generation prompt describing the slide's background visual (no text-in-image instructions).
- "narration": one or two natural spoken sentences for the voiceover of this slide.

Return ONLY a JSON array of ${slideCount} objects with keys "caption", "imagePrompt", "narration". No prose, no markdown fences.`;

    const prompt = `Create a ${slideCount}-slide captioned slideshow about:\n\n${topic}`;

    let response: string;
    try {
        response = await generateTextWithClient({
            model: pref.modelId,
            system,
            messages: [{ role: 'user', content: prompt }],
            userApiKeys,
            routeHint: pref.routeHint,
            temperature: 0.8,
            maxTokens: 2000,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Slideshow script generation failed: ${message}`);
    }

    const slides = coerceSlides(extractJson(response), slideCount);
    return { slides };
}
