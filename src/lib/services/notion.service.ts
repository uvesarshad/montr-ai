/**
 * Notion Service
 * Handles interactions with the Notion API and content conversion
 */
import { fetchWithRetry } from '@/lib/integrations/server/fetch-with-retry';

/** Thrown when Notion rejects the access token (401) — the caller should mark the connection needs-reauth. */
export class NotionAuthError extends Error {
    readonly status: number;
    constructor(message: string, status = 401) {
        super(message);
        this.name = 'NotionAuthError';
        this.status = status;
    }
}

export interface NotionRichText {
    plain_text: string;
    href?: string | null;
    annotations: {
        bold: boolean;
        italic: boolean;
        strikethrough: boolean;
        code: boolean;
        underline?: boolean;
        color?: string;
    };
}

/** Shape of a Notion block's typed content (paragraph, heading, etc.) */
interface NotionBlockContent {
    rich_text: NotionRichText[];
    checked?: boolean;
    language?: string;
    type?: string;
    external?: { url: string };
    file?: { url: string };
    icon?: { emoji?: string };
}

/** Generic shape of a Notion API object returned from search/query results */
interface NotionApiObject {
    id: string;
    object?: string;
    url?: string;
    title?: NotionRichText[];
    last_edited_time?: string;
    properties?: Record<string, NotionProperty>;
}

interface NotionProperty {
    type: string;
    title?: NotionRichText[];
    [key: string]: unknown;
}

export interface NotionBlock {
    type: string;
    id?: string;
    has_children?: boolean;
    children?: NotionBlock[];
    [key: string]: unknown;
}

export interface NotionPage {
    id: string;
    title: string;
    url: string;
    lastEditedAt: string;
}

export interface NotionDatabase {
    id: string;
    title: string;
    url: string;
}

export class NotionService {
    private accessToken: string;
    private baseUrl = 'https://api.notion.com/v1';
    private version = '2022-06-28';

    constructor(accessToken: string) {
        this.accessToken = accessToken;
    }

    private async request(endpoint: string, options: RequestInit = {}) {
        const response = await fetchWithRetry(
            `${this.baseUrl}${endpoint}`,
            {
                ...options,
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Notion-Version': this.version,
                    'Content-Type': 'application/json',
                    ...options.headers,
                },
            },
            { label: 'notion' }
        );

        if (!response.ok) {
            const error = (await response.json().catch(() => ({}))) as { message?: string };
            const message = error.message || response.statusText;
            // 401 = invalid/revoked token; surface a typed error so the sync
            // layer can flag the connection as needing reconnection.
            if (response.status === 401) {
                throw new NotionAuthError(`Notion API Error: ${message}`);
            }
            throw new Error(`Notion API Error: ${message}`);
        }

        return response.json();
    }

    /**
     * List all databases accessible to the integration
     */
    async listDatabases(): Promise<NotionDatabase[]> {
        const data = await this.request('/search', {
            method: 'POST',
            body: JSON.stringify({
                filter: {
                    property: 'object',
                    value: 'database',
                },
            }),
        });

        return data.results.map((db: NotionApiObject) => ({
            id: db.id as string,
            title: (db.title as NotionRichText[] | undefined)?.[0]?.plain_text || 'Untitled Database',
            url: db.url as string,
        }));
    }

    /**
     * List items in a database
     */
    async getDatabaseItems(databaseId: string): Promise<NotionPage[]> {
        const data = await this.request(`/databases/${databaseId}/query`, {
            method: 'POST',
        });

        return data.results.map((page: NotionApiObject) => ({
            id: page.id,
            title: this.extractPageTitle(page),
            url: page.url ?? '',
            lastEditedAt: page.last_edited_time ?? '',
        }));
    }

    /**
     * Search for pages and databases
     */
    async search(query: string = ''): Promise<{ pages: NotionPage[]; databases: NotionDatabase[] }> {
        const data = await this.request('/search', {
            method: 'POST',
            body: JSON.stringify({
                query,
                sort: {
                    direction: 'descending',
                    timestamp: 'last_edited_time',
                },
            }),
        });

        const pages: NotionPage[] = [];
        const databases: NotionDatabase[] = [];

        for (const item of data.results) {
            if (item.object === 'page') {
                pages.push({
                    id: item.id,
                    title: this.extractPageTitle(item),
                    url: item.url,
                    lastEditedAt: item.last_edited_time,
                });
            } else if (item.object === 'database') {
                databases.push({
                    id: item.id,
                    title: item.title?.[0]?.plain_text || 'Untitled Database',
                    url: item.url,
                });
            }
        }

        return { pages, databases };
    }

    /**
     * Get page content as a collection of blocks
     */
    async getPageBlocks(pageId: string): Promise<NotionBlock[]> {
        let results: NotionBlock[] = [];
        let hasMore = true;
        let startCursor: string | undefined = undefined;

        while (hasMore) {
            const endpoint = `/blocks/${pageId}/children${startCursor ? `?start_cursor=${startCursor}` : ''}`;
            const data = await this.request(endpoint);
            results = [...results, ...data.results];
            hasMore = data.has_more;
            startCursor = data.next_cursor;
        }

        // Recursively fetch children for blocks that have them (like nested lists)
        for (const block of results) {
            if (block.has_children && block.id) {
                block.children = await this.getPageBlocks(block.id);
            }
        }

        return results;
    }

    /**
     * Get a page's metadata (title, url, last_edited_time, archived).
     */
    async getPage(pageId: string): Promise<NotionPage & { archived: boolean }> {
        const page = await this.request(`/pages/${pageId}`);
        return {
            id: page.id,
            title: this.extractPageTitle(page),
            url: page.url ?? '',
            lastEditedAt: page.last_edited_time ?? '',
            archived: !!page.archived,
        };
    }

    /**
     * Shallow list of a page's direct child block ids (paginated).
     * Unlike getPageBlocks this does NOT recurse — used to clear a page
     * before re-pushing content.
     */
    async listChildBlockIds(pageId: string): Promise<string[]> {
        const ids: string[] = [];
        let hasMore = true;
        let startCursor: string | undefined = undefined;

        while (hasMore) {
            const endpoint = `/blocks/${pageId}/children${startCursor ? `?start_cursor=${startCursor}` : ''}`;
            const data = await this.request(endpoint);
            for (const block of data.results as { id: string }[]) {
                ids.push(block.id);
            }
            hasMore = data.has_more;
            startCursor = data.next_cursor;
        }

        return ids;
    }

    /**
     * Delete (archive) a block.
     */
    async deleteBlock(blockId: string): Promise<void> {
        await this.request(`/blocks/${blockId}`, { method: 'DELETE' });
    }

    /**
     * Append blocks to a page, batched to Notion's 100-blocks-per-request cap.
     */
    async appendBlocks(pageId: string, blocks: Record<string, unknown>[]): Promise<void> {
        for (let i = 0; i < blocks.length; i += 100) {
            const batch = blocks.slice(i, i + 100);
            await this.request(`/blocks/${pageId}/children`, {
                method: 'PATCH',
                body: JSON.stringify({ children: batch }),
            });
        }
    }

    /**
     * Update a page's title. Best-effort: database rows name their title
     * property freely, so a failed patch is swallowed (content sync matters more).
     */
    async updatePageTitle(pageId: string, title: string): Promise<void> {
        try {
            await this.request(`/pages/${pageId}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    properties: {
                        title: { title: [{ type: 'text', text: { content: title } }] },
                    },
                }),
            });
        } catch (error) {
            console.warn(`[NotionService] Could not update title for page ${pageId}:`, error);
        }
    }

    /**
     * Convert Notion blocks to Markdown string
     */
    blocksToMarkdown(blocks: NotionBlock[]): string {
        return blocks.map(block => this.blockToMarkdown(block)).join('\n\n');
    }

    private blockToMarkdown(block: NotionBlock): string {
        const type = block.type;
        const content = block[type] as NotionBlockContent;

        switch (type) {
            case 'paragraph':
                return this.richTextToMarkdown(content.rich_text);
            case 'heading_1':
                return `# ${this.richTextToMarkdown(content.rich_text)}`;
            case 'heading_2':
                return `## ${this.richTextToMarkdown(content.rich_text)}`;
            case 'heading_3':
                return `### ${this.richTextToMarkdown(content.rich_text)}`;
            case 'bulleted_list_item':
                const bull = `* ${this.richTextToMarkdown(content.rich_text)}`;
                if (block.children) {
                    return `${bull}\n${block.children.map((c: NotionBlock) => `  ${this.blockToMarkdown(c)}`).join('\n')}`;
                }
                return bull;
            case 'numbered_list_item':
                const num = `1. ${this.richTextToMarkdown(content.rich_text)}`;
                if (block.children) {
                    return `${num}\n${block.children.map((c: NotionBlock) => `  ${this.blockToMarkdown(c)}`).join('\n')}`;
                }
                return num;
            case 'to_do':
                return `- [${content.checked ? 'x' : ' '}] ${this.richTextToMarkdown(content.rich_text)}`;
            case 'code':
                return `\`\`\`${content.language}\n${this.richTextToMarkdown(content.rich_text)}\n\`\`\``;
            case 'quote':
                return `> ${this.richTextToMarkdown(content.rich_text)}`;
            case 'divider':
                return '---';
            case 'image':
                const url = content.type === 'external' ? (content.external?.url ?? '') : (content.file?.url ?? '');
                return `![Notion Image](${url})`;
            case 'callout':
                return `> ${content.icon?.emoji ? `${content.icon.emoji} ` : ''}${this.richTextToMarkdown(content.rich_text)}`;
            default:
                return ''; // Unsupported blocks for now
        }
    }

    private richTextToMarkdown(richText: NotionRichText[]): string {
        if (!richText) return '';
        return richText.map(rt => {
            let text = rt.plain_text;
            if (rt.annotations.bold) text = `**${text}**`;
            if (rt.annotations.italic) text = `*${text}*`;
            if (rt.annotations.strikethrough) text = `~~${text}~~`;
            if (rt.annotations.code) text = `\`${text}\``;
            if (rt.href) text = `[${text}](${rt.href})`;
            return text;
        }).join('');
    }

    private extractPageTitle(page: NotionApiObject): string {
        // Notion page titles can be in different properties depending on if it's a database item or a standalone page
        const properties = page.properties;
        if (!properties) return page.title?.[0]?.plain_text || 'Untitled Page';

        // Find the 'title' property
        for (const key in properties) {
            if (properties[key].type === 'title') {
                return properties[key].title?.[0]?.plain_text || 'Untitled Page';
            }
        }

        return 'Untitled Page';
    }
}
