// OSS single-tenant override of src/lib/social/autopost.ts — CP-2 hand-patch; org-stripped.
/**
 * AI RSS → draft autopost (Epic 4.1).
 *
 * Three responsibilities, all owned by this module:
 *   1. `fetchFeedItems(feedUrl)` — fetch + parse an RSS 2.0 / Atom feed into a
 *      normalized list of items (title, link, guid, contentSnippet). The fetch
 *      goes through the SSRF guard (`safeOutboundFetch`) so a user-supplied
 *      feed URL can't be used to reach internal services.
 *   2. `generatePostFromArticle(...)` — turn one article into a short social
 *      caption via the shared AI client (`src/ai/client.ts`). Brand-voice aware.
 *      NEVER calls a provider SDK directly.
 *   3. `runDueRssSources()` — the cron body. Walks every due RSS source, dedupes
 *      against the last-seen item, generates a caption, and routes the result
 *      into the social approval workflow (draft when autoApprove is false,
 *      scheduled post otherwise). Updates last-seen / records errors per source.
 *
 * Ownership: every source already carries `brandId` / `userId` (server-derived
 * at creation time), so the cron trusts those and never takes a brand from
 * anywhere else.
 */

import { rssSourceRepository } from '@/lib/db/repository/rss-source.repository';
import type { IRssSource } from '@/lib/db/models/rss-source.model';
import { draftRepository } from '@/lib/db/repository/draft.repository';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { submitSocialPost } from '@/lib/social/social-post-submissions';
import { generateTextWithClient } from '@/ai/client';
import { AISettingsService } from '@/lib/services/ai-settings.service';
import { userRepository } from '@/lib/db/repository/user.repository';
import { loadBrandProfile } from '@/lib/social/brand-access';
import { buildBrandProfileNote } from '@/ai/types';
import { safeOutboundFetch } from '@/lib/workflow/ssrf-guard';
import type { IPlatformConfig } from '@/lib/db/models/scheduled-post.model';
import type { IDraftPlatformConfig } from '@/lib/db/models/draft.model';

export interface FeedItem {
    title: string;
    link: string;
    guid: string;
    contentSnippet: string;
}

/** Strip HTML tags + collapse whitespace; decode the few entities feeds use. */
function stripHtml(input: string): string {
    return input
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

/** Pull the first matching tag's inner text out of an XML block. */
function extractTag(block: string, tag: string): string {
    // Handles <tag>..</tag> and <tag attr="...">..</tag> and CDATA.
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i');
    const m = re.exec(block);
    return m ? stripHtml(m[1]) : '';
}

/** Atom <link href="..."/> (self-closing, attribute-based). */
function extractAtomLink(block: string): string {
    // Prefer rel="alternate" or no rel; fall back to the first href.
    const alt = /<link\b[^>]*\brel=["']alternate["'][^>]*\bhref=["']([^"']+)["'][^>]*\/?>/i.exec(block);
    if (alt) return alt[1];
    const any = /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?>/i.exec(block);
    return any ? any[1] : '';
}

/**
 * Fetch + parse an RSS/Atom feed. Lightweight regex parser — feeds are small and
 * we only need a handful of fields. Returns items newest-first as the feed
 * provides them (feeds are conventionally reverse-chronological).
 */
export async function fetchFeedItems(feedUrl: string): Promise<FeedItem[]> {
    const res = await safeOutboundFetch(feedUrl, {
        headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
        // Reasonable bound — feeds shouldn't take long.
        signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
        throw new Error(`Feed fetch failed (${res.status} ${res.statusText})`);
    }

    const xml = await res.text();
    const items: FeedItem[] = [];

    // RSS 2.0 / RDF: <item>...</item>
    const itemBlocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
    for (const block of itemBlocks) {
        const title = extractTag(block, 'title');
        const link = extractTag(block, 'link');
        const guid = extractTag(block, 'guid') || link;
        const snippet =
            extractTag(block, 'description') ||
            extractTag(block, 'content:encoded') ||
            extractTag(block, 'summary');
        if (title || link) {
            items.push({ title, link, guid: guid || title, contentSnippet: snippet });
        }
    }

    // Atom: <entry>...</entry>
    if (items.length === 0) {
        const entryBlocks = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
        for (const block of entryBlocks) {
            const title = extractTag(block, 'title');
            const link = extractAtomLink(block);
            const guid = extractTag(block, 'id') || link;
            const snippet = extractTag(block, 'summary') || extractTag(block, 'content');
            if (title || link) {
                items.push({ title, link, guid: guid || title, contentSnippet: snippet });
            }
        }
    }

    return items;
}

export interface GeneratePostInput {
    title: string;
    url: string;
    snippet: string;
    brandId: string;
    /** Used to resolve AI preferences + BYOK keys (the source's owner). */
    userId: string;
    platforms: string[];
}

/**
 * Write a short social caption for one article via the shared AI client. Uses the
 * owner's preferred social-assistant model + BYOK keys and is brand-voice aware.
 * Returns trimmed caption text. Throws on AI failure (caller records the error).
 *
 * Runs in the cron (no request session), so it deliberately uses the
 * session-free `generateTextWithClient` primitive rather than the session-bound
 * `enhanceContent` flow.
 */
export async function generatePostFromArticle(input: GeneratePostInput): Promise<string> {
    const { title, url, snippet, brandId, userId, platforms } = input;

    const [pref, user, brandProfile] = await Promise.all([
        AISettingsService.getPreferredModel(userId, 'socialAssistant'),
        userRepository.findById(userId),
        loadBrandProfile(brandId),
    ]);

    const userApiKeys = user
        ? {
              openai: user.openaiApiKey || process.env.OPENAI_API_KEY,
              anthropic: user.anthropicApiKey || process.env.ANTHROPIC_API_KEY,
              google: user.googleApiKey || process.env.GEMINI_API_KEY,
              xai: user.xaiApiKey || process.env.XAI_API_KEY,
              deepseek: user.deepseekApiKey || process.env.DEEPSEEK_API_KEY,
              mistral: user.mistralApiKey || process.env.MISTRAL_API_KEY,
              cohere: user.cohereApiKey || process.env.COHERE_API_KEY,
              groq: user.groqApiKey || process.env.GROQ_API_KEY,
              perplexity: user.perplexityApiKey || process.env.PERPLEXITY_API_KEY,
              fal: user.falApiKey || process.env.FAL_API_KEY,
              openrouter: user.openrouterApiKey || process.env.OPENROUTER_API_KEY,
          }
        : undefined;

    const platformGuide = platforms.length
        ? `Optimize for these platforms: ${platforms.join(', ')}. `
        : '';
    const brandNote = buildBrandProfileNote(brandProfile);

    const system = `You are an expert social media copywriter writing a short, engaging post that shares a news article with an audience. ${platformGuide}${brandNote}

Guidelines:
- Write 1-3 short sentences (under ~60 words) that hook the reader and convey the gist.
- Be specific and add a point of view; do not just restate the headline.
- Do NOT include the article URL (it is appended separately).
- Do NOT add hashtags.
- Return ONLY the caption text, nothing else.`;

    const promptBody = [
        `Headline: ${title || '(untitled)'}`,
        snippet ? `Summary: ${snippet.slice(0, 1200)}` : '',
        `Source URL: ${url}`,
    ]
        .filter(Boolean)
        .join('\n');

    const caption = await generateTextWithClient({
        model: pref.modelId,
        system,
        messages: [{ role: 'user', content: `Write a social post about this article:\n\n${promptBody}` }],
        userApiKeys,
        routeHint: pref.routeHint,
        temperature: 0.7,
        maxTokens: 300,
    });

    const trimmed = caption.trim();
    // Append the link so the post is actually useful/clickable.
    return url ? `${trimmed}\n\n${url}` : trimmed;
}

/** Pick the most-recent item; returns null when the feed has nothing usable. */
function newestItem(items: FeedItem[]): FeedItem | null {
    return items.length ? items[0] : null;
}

/** True when this item was already seen (dedupe on guid first, then url). */
function alreadySeen(source: IRssSource, item: FeedItem): boolean {
    if (source.lastSeenGuid && item.guid && source.lastSeenGuid === item.guid) return true;
    if (source.lastSeenUrl && item.link && source.lastSeenUrl === item.link) return true;
    return false;
}

/**
 * Resolve the concrete target accounts for a source's chosen platforms. Prefers
 * explicit `targetAccountIds`; otherwise picks the brand's active account for
 * each requested platform.
 */
async function resolveTargetAccounts(source: IRssSource): Promise<IPlatformConfig[]> {
    const accounts = await socialAccountRepository.findByBrandId(source.brandId);
    const active = accounts.filter((a) => a.isActive);

    const chosen = source.targetAccountIds?.length
        ? active.filter((a) => source.targetAccountIds.includes(a._id.toString()))
        : active.filter(
              (a) => !source.targetPlatforms?.length || source.targetPlatforms.includes(a.platform),
          );

    return chosen.map((a) => ({
        accountId: a._id.toString(),
        platform: a.platform,
        platformUsername: a.platformUsername,
    }));
}

export interface RunRssResult {
    processed: number;
    posted: number;
    skipped: number;
    errored: number;
}

/**
 * Cron body: process every RSS source that is due. Exported for cron wiring
 * (registration handled separately).
 *
 *   - Fetch the feed, dedupe against last-seen.
 *   - Generate a caption for the newest unseen item.
 *   - autoApprove === false → save a Draft (the human reviews it).
 *     autoApprove === true  → submit through `submitSocialPost` (still subject
 *     to brand approval policy, which may itself force pending_approval).
 *   - Advance last-seen / record errors per source. One source's failure never
 *     aborts the batch.
 */
export async function runDueRssSources(limit = 100): Promise<RunRssResult> {
    const result: RunRssResult = { processed: 0, posted: 0, skipped: 0, errored: 0 };

    const due = await rssSourceRepository.listDue(limit);

    for (const source of due) {
        result.processed += 1;
        const id = source._id.toString();

        try {
            const items = await fetchFeedItems(source.feedUrl);
            const item = newestItem(items);

            if (!item) {
                // Nothing in the feed — just bump lastFetchedAt so we don't hammer it.
                await rssSourceRepository.updateLastSeen(id, {});
                result.skipped += 1;
                continue;
            }

            if (alreadySeen(source, item)) {
                await rssSourceRepository.updateLastSeen(id, {});
                result.skipped += 1;
                continue;
            }

            const caption = await generatePostFromArticle({
                title: item.title,
                url: item.link,
                snippet: item.contentSnippet,
                brandId: source.brandId,
                userId: source.userId,
                platforms: source.targetPlatforms || [],
            });

            const targets = await resolveTargetAccounts(source);

            if (!source.autoApprove) {
                // Default path: park as a draft for human review.
                const draftPlatforms: IDraftPlatformConfig[] = targets.map((t) => ({
                    accountId: t.accountId,
                    platform: t.platform,
                    platformUsername: t.platformUsername,
                }));
                await draftRepository.create({
                    brandId: source.brandId,
                    userId: source.userId,
                    title: item.title || `From ${source.name}`,
                    content: caption,
                    platforms: draftPlatforms,
                });
            } else if (targets.length > 0) {
                // Auto-approve path: route through the submission pipeline, which
                // still honors brand approval policy (may force pending_approval).
                await submitSocialPost({
                    userId: source.userId,
                    intent: 'schedule',
                    brandId: source.brandId,
                    content: caption,
                    platforms: targets,
                    scheduledFor: new Date(), // publish ASAP within policy
                    timezone: 'UTC',
                });
            } else {
                // autoApprove but no connected accounts — fall back to a draft so
                // the generated content isn't lost.
                await draftRepository.create({
                    brandId: source.brandId,
                    userId: source.userId,
                    title: item.title || `From ${source.name}`,
                    content: caption,
                });
            }

            // Advance dedupe cursor to this item.
            await rssSourceRepository.updateLastSeen(id, { url: item.link, guid: item.guid });
            result.posted += 1;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[autopost] RSS source ${id} failed:`, message);
            await rssSourceRepository.recordError(id, message).catch(() => undefined);
            result.errored += 1;
        }
    }

    return result;
}
