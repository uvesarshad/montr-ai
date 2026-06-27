/**
 * Agent Ingestion Tools (G13 — asset & inspiration ingestion, 2026-06-05)
 *
 * These let the agent pull external material into the brand's working memory:
 *   • ingest_website        — scrape a URL → index into the Knowledge Base
 *   • import_social_content — digest the brand's published posts → KB (style ref)
 *   • analyze_inspiration   — scrape + LLM-analyze a reference URL → Research note
 *
 * All three only READ external content and write internal notes/KB, so they
 * carry hitlPolicy 'never'.
 */

import { z } from 'zod';
import { tool } from 'ai';
import { Types } from 'mongoose';
import { AgentContext } from './types';
import { toolRegistry } from '../tool-registry';
import { knowledgeBaseService } from '@/lib/inbox/knowledge-base.service';
import { convertUrlToMarkdown } from '@/ai/flows/url-to-markdown-flow';
import { scheduledPostRepository } from '@/lib/db/repository/scheduled-post.repository';
import { writeWorkspaceDoc } from '@/lib/agent/workspace';
import { generateTextWithClient } from '@/ai/client';

const MAX_KB_CHARS = 30_000;

/** Best-effort extraction of an `# H1` / `<h1>` title from markdown content. */
function extractTitle(markdown: string): string | undefined {
    const md = markdown.match(/^\s*#\s+(.+?)\s*$/m);
    if (md?.[1]) return md[1].trim().slice(0, 200);
    const html = markdown.match(/<h1[^>]*>(.*?)<\/h1>/i);
    if (html?.[1]) return html[1].replace(/<[^>]+>/g, '').trim().slice(0, 200);
    return undefined;
}

// ─── ingest_website ─────────────────────────────────────────────────────────

const ingestWebsiteParams = z.object({
    url: z.string().url().describe('Public URL to scrape and add to the Knowledge Base.'),
    saveAs: z.string().max(200).optional().describe('Optional name for the Knowledge Base entry (defaults to the page title or URL).'),
});

export const ingestWebsiteTool = {
    name: 'ingest_website',
    description: 'Scrape a public webpage and add its content to the brand Knowledge Base so you (and search) can reference it later. Consumes scraping credits.',
    parameters: ingestWebsiteParams,
    hitlPolicy: 'never' as const,
    factory: (context: AgentContext) => tool({
        description: 'Scrape a URL into the Knowledge Base.',
        parameters: ingestWebsiteParams,
        execute: async (args) => {
            try {
                if (!Types.ObjectId.isValid(context.userId)) {
                    return { success: false, error: 'Invalid Object ID for user' };
                }

                const { markdownContent } = await convertUrlToMarkdown({ url: args.url });
                const title = args.saveAs ?? extractTitle(markdownContent) ?? args.url;
                const content = markdownContent.slice(0, MAX_KB_CHARS);

                const kb = await knowledgeBaseService.indexDocument({
                    brandId: context.brandId || context.userId,
                    name: title,
                    content,
                    type: 'url',
                    sourceModule: 'agent',
                    metadata: { sourceUrl: args.url },
                    createdById: new Types.ObjectId(context.userId),
                });

                const kbEntryId = (kb as { _id?: { toString(): string } })?._id?.toString();
                return { success: true, kbEntryId, title, chars: content.length };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        },
    }),
};

// ─── import_social_content ──────────────────────────────────────────────────

const importSocialContentParams = z.object({
    limit: z.number().int().min(1).max(50).optional().describe('How many recent published posts to import (default 20).'),
});

export const importSocialContentTool = {
    name: 'import_social_content',
    description: 'Import the brand\'s recently published social posts into the Knowledge Base as a style reference, so you can match the brand\'s existing voice when drafting new content.',
    parameters: importSocialContentParams,
    hitlPolicy: 'never' as const,
    factory: (context: AgentContext) => tool({
        description: 'Digest the brand\'s published social posts into the Knowledge Base.',
        parameters: importSocialContentParams,
        execute: async (args) => {
            try {
                if (!Types.ObjectId.isValid(context.userId)) {
                    return { success: false, error: 'Invalid Object ID for user' };
                }

                const brandId = context.brandId || context.userId;
                const limit = args.limit ?? 20;

                const posts = await scheduledPostRepository.findByBrand(brandId, { status: 'published' });
                if (!posts.length) {
                    return { success: true, postsImported: 0, kbEntryId: undefined };
                }

                const selected = posts.slice(0, limit);
                const sections = selected.map((post, i) => {
                    const platforms = (post.platforms ?? []).map((p) => p.platform).join(', ') || 'unknown';
                    // IScheduledPost has no publishedAt — publish time lives in
                    // publishResults; scheduledFor is the closest stable date.
                    const publishedAt = (post as unknown as { publishedAt?: Date }).publishedAt;
                    const when = publishedAt
                        ? new Date(publishedAt).toISOString().slice(0, 10)
                        : (post.scheduledFor ? new Date(post.scheduledFor).toISOString().slice(0, 10) : 'n/a');
                    return `## Post ${i + 1} — ${platforms} (${when})\n\n${post.content ?? ''}`;
                });

                const digest = `# Existing social content — style reference\n\n${sections.join('\n\n---\n\n')}`.slice(0, MAX_KB_CHARS);

                const kb = await knowledgeBaseService.indexDocument({
                    brandId,
                    name: 'Existing social content — style reference',
                    content: digest,
                    type: 'text',
                    sourceModule: 'agent',
                    metadata: { postsImported: selected.length },
                    createdById: new Types.ObjectId(context.userId),
                });

                const kbEntryId = (kb as { _id?: { toString(): string } })?._id?.toString();
                return { success: true, postsImported: selected.length, kbEntryId };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        },
    }),
};

// ─── analyze_inspiration ────────────────────────────────────────────────────

const analyzeInspirationParams = z.object({
    url: z.string().url().describe('Reference URL to study for inspiration (competitor page, article, landing page, etc.).'),
    focus: z.string().max(200).optional().describe('What to focus the analysis on (e.g. "Instagram captions", "landing-page hooks").'),
});

export const analyzeInspirationTool = {
    name: 'analyze_inspiration',
    description: 'Scrape a reference URL and analyze its tone, structure, hooks, CTAs, and style cues, then save the breakdown as a Research note in your Agent Workspace. Consumes scraping credits.',
    parameters: analyzeInspirationParams,
    hitlPolicy: 'never' as const,
    factory: (context: AgentContext) => tool({
        description: 'Analyze a reference URL and write a Research note.',
        parameters: analyzeInspirationParams,
        execute: async (args) => {
            try {
                const { markdownContent } = await convertUrlToMarkdown({ url: args.url });
                const source = markdownContent.slice(0, MAX_KB_CHARS);

                const focusLine = args.focus
                    ? `Focus the analysis specifically on: ${args.focus}.`
                    : 'Cover the content broadly.';

                const analysis = await generateTextWithClient({
                    model: 'gemini-2.5-flash',
                    routeHint: { sdk: 'genkit', provider: 'google', keySource: 'system' },
                    maxTokens: 800,
                    system: 'You are a marketing analyst who reverse-engineers what makes content effective. Be concise and specific.',
                    messages: [
                        {
                            role: 'user',
                            content: `Analyze the following content from ${args.url} and extract: (1) tone of voice, (2) content structure, (3) hooks / opening lines, (4) CTA patterns, (5) visual / style cues. ${focusLine}\n\n---\n\n${source}`,
                        },
                    ],
                });

                const title = `Inspiration analysis — ${extractTitle(source) ?? args.url}`.slice(0, 200);
                const escaped = analysis
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');
                const content = `<h1>${title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</h1>
<p><strong>Source:</strong> <a href="${args.url}">${args.url}</a>${args.focus ? ` · <strong>Focus:</strong> ${args.focus}` : ''}</p>
<pre style="white-space:pre-wrap">${escaped}</pre>`;

                const { docId } = await writeWorkspaceDoc({
                    userId: context.userId,
                    brandId: context.brandId || context.userId,
                    folder: 'Research',
                    title,
                    content,
                });

                return { success: true, docId, deepLink: `/docs/${docId}` };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        },
    }),
};

toolRegistry.register(ingestWebsiteTool);
toolRegistry.register(importSocialContentTool);
toolRegistry.register(analyzeInspirationTool);
