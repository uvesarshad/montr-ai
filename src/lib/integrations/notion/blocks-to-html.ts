/**
 * Notion blocks → HTML (TipTap-compatible).
 *
 * Document.content is HTML (the docs editor saves editor.getHTML()), so the
 * pull side of Notion sync renders Notion blocks straight to HTML. Covers a
 * wider block set than the legacy blocksToMarkdown in notion.service.ts:
 * toggles, tables, embeds, bookmarks, files and synced blocks included.
 */

import type { NotionBlock, NotionRichText } from '@/lib/services/notion.service';

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeAttr(text: string): string {
    return escapeHtml(text).replace(/'/g, '&#39;');
}

export function richTextToHtml(richText: NotionRichText[] | undefined): string {
    if (!richText?.length) return '';
    return richText
        .map((rt) => {
            let html = escapeHtml(rt.plain_text);
            const a = rt.annotations;
            if (a.code) html = `<code>${html}</code>`;
            if (a.bold) html = `<strong>${html}</strong>`;
            if (a.italic) html = `<em>${html}</em>`;
            if (a.strikethrough) html = `<s>${html}</s>`;
            if (a.underline) html = `<u>${html}</u>`;
            if (rt.href) html = `<a href="${escapeAttr(rt.href)}">${html}</a>`;
            return html;
        })
        .join('');
}

interface BlockContent {
    rich_text?: NotionRichText[];
    checked?: boolean;
    language?: string;
    type?: string;
    external?: { url: string };
    file?: { url: string };
    icon?: { emoji?: string };
    url?: string;
    caption?: NotionRichText[];
    cells?: NotionRichText[][];
    has_column_header?: boolean;
    title?: string;
}

function blockFileUrl(content: BlockContent): string {
    return content.type === 'external' ? content.external?.url || '' : content.file?.url || '';
}

function childrenHtml(block: NotionBlock): string {
    return block.children?.length ? blocksToHtml(block.children) : '';
}

/**
 * Convert a list of sibling blocks to HTML. Consecutive list items are
 * grouped into a single <ul>/<ol> — Notion stores them as flat siblings.
 */
export function blocksToHtml(blocks: NotionBlock[]): string {
    const html: string[] = [];
    let i = 0;

    while (i < blocks.length) {
        const block = blocks[i];
        const type = block.type;

        if (type === 'bulleted_list_item' || type === 'numbered_list_item' || type === 'to_do') {
            const tag = type === 'numbered_list_item' ? 'ol' : 'ul';
            const items: string[] = [];
            const groupType = type;
            while (i < blocks.length && blocks[i].type === groupType) {
                items.push(listItemToHtml(blocks[i]));
                i++;
            }
            const attrs = groupType === 'to_do' ? ' data-type="taskList"' : '';
            html.push(`<${tag}${attrs}>${items.join('')}</${tag}>`);
            continue;
        }

        const rendered = blockToHtml(block);
        if (rendered) html.push(rendered);
        i++;
    }

    return html.join('');
}

function listItemToHtml(block: NotionBlock): string {
    const content = block[block.type] as BlockContent;
    const inner = richTextToHtml(content.rich_text);
    const nested = childrenHtml(block);

    if (block.type === 'to_do') {
        // TipTap task-item shape; degrades to a checkbox in plain HTML.
        return (
            `<li data-type="taskItem" data-checked="${content.checked ? 'true' : 'false'}">` +
            `<p>${inner}</p>${nested}</li>`
        );
    }
    return `<li><p>${inner}</p>${nested}</li>`;
}

function blockToHtml(block: NotionBlock): string {
    const type = block.type;
    const content = (block[type] || {}) as BlockContent;
    const text = richTextToHtml(content.rich_text);

    switch (type) {
        case 'paragraph':
            return text ? `<p>${text}</p>` : '<p></p>';
        case 'heading_1':
            return `<h1>${text}</h1>${childrenHtml(block)}`;
        case 'heading_2':
            return `<h2>${text}</h2>${childrenHtml(block)}`;
        case 'heading_3':
            return `<h3>${text}</h3>${childrenHtml(block)}`;
        case 'code': {
            const language = content.language && content.language !== 'plain text' ? content.language : '';
            const languageAttr = language ? ` class="language-${escapeAttr(language)}"` : '';
            return `<pre><code${languageAttr}>${text}</code></pre>`;
        }
        case 'quote':
            return `<blockquote><p>${text}</p>${childrenHtml(block)}</blockquote>`;
        case 'callout': {
            const emoji = content.icon?.emoji ? `${escapeHtml(content.icon.emoji)} ` : '';
            return `<blockquote data-notion-type="callout"><p>${emoji}${text}</p>${childrenHtml(block)}</blockquote>`;
        }
        case 'divider':
            return '<hr>';
        case 'image': {
            const url = blockFileUrl(content);
            if (!url) return '';
            const caption = richTextToHtml(content.caption);
            const alt = content.caption?.map((c) => c.plain_text).join('') || 'Notion image';
            const img = `<img src="${escapeAttr(url)}" alt="${escapeAttr(alt)}">`;
            return caption ? `<figure>${img}<figcaption>${caption}</figcaption></figure>` : `<p>${img}</p>`;
        }
        case 'video':
        case 'file':
        case 'pdf': {
            const url = blockFileUrl(content);
            if (!url) return '';
            const label = content.caption?.map((c) => c.plain_text).join('') || url;
            return `<p><a href="${escapeAttr(url)}">${escapeHtml(label)}</a></p>`;
        }
        case 'bookmark':
        case 'embed':
        case 'link_preview': {
            const url = content.url || '';
            if (!url) return '';
            return `<p><a href="${escapeAttr(url)}">${escapeHtml(url)}</a></p>`;
        }
        case 'toggle':
            // No native disclosure node in the editor — heading + indented body.
            return `<p><strong>${text}</strong></p>${childrenHtml(block)}`;
        case 'table': {
            const rows = block.children || [];
            const hasHeader = !!content.has_column_header;
            const body = rows
                .map((row, rowIndex) => {
                    const rowContent = (row.table_row || {}) as BlockContent;
                    const cellTag = hasHeader && rowIndex === 0 ? 'th' : 'td';
                    const cells = (rowContent.cells || [])
                        .map((cell) => `<${cellTag}><p>${richTextToHtml(cell)}</p></${cellTag}>`)
                        .join('');
                    return `<tr>${cells}</tr>`;
                })
                .join('');
            return `<table><tbody>${body}</tbody></table>`;
        }
        case 'column_list':
        case 'column':
        case 'synced_block':
            // Layout containers — flatten to their children.
            return childrenHtml(block);
        case 'child_page': {
            // Reference only — link to the Notion subpage. Full recursion is
            // deliberately out of scope (unbounded fan-out).
            const pageId = (block.id || '').replace(/-/g, '');
            const title = content.title || 'Untitled';
            if (!pageId) return text ? `<p>${text}</p>` : '';
            return `<p><a href="https://www.notion.so/${escapeAttr(pageId)}">📄 ${escapeHtml(title)}</a></p>`;
        }
        case 'table_row':
            return ''; // handled by the table case
        default:
            // Unknown block: salvage any rich text rather than dropping silently.
            return text ? `<p>${text}</p>` : '';
    }
}
