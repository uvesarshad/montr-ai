/**
 * HTML (TipTap output) → Notion blocks.
 *
 * The push side of Notion doc sync: converts Document.content (HTML from
 * editor.getHTML()) into Notion block objects for the append-children API.
 * Unsupported nodes degrade to paragraphs rather than being dropped.
 *
 * cheerio is used only for parsing; traversal works on the raw DOM tree with
 * a minimal structural node type (the installed @types/cheerio predates the
 * modern cheerio type surface).
 */

import * as cheerio from 'cheerio';

interface NotionAnnotations {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
    code?: boolean;
}

export interface NotionRichTextOut {
    type: 'text';
    text: { content: string; link?: { url: string } | null };
    annotations?: NotionAnnotations;
}

export interface NotionBlockOut {
    object: 'block';
    type: string;
    [key: string]: unknown;
}

/** Minimal structural view of the htmlparser2 DOM cheerio produces. */
interface DomNode {
    type: string; // 'text' | 'tag' | 'comment' | ...
    data?: string; // text content for text nodes
    name?: string; // tag name for tag nodes
    attribs?: Record<string, string>;
    children?: DomNode[];
}

/** Notion caps rich_text content at 2000 chars per item. */
const MAX_TEXT_LENGTH = 2000;

function chunkText(content: string): string[] {
    if (content.length <= MAX_TEXT_LENGTH) return [content];
    const chunks: string[] = [];
    for (let i = 0; i < content.length; i += MAX_TEXT_LENGTH) {
        chunks.push(content.slice(i, i + MAX_TEXT_LENGTH));
    }
    return chunks;
}

function makeRichText(
    content: string,
    annotations: NotionAnnotations,
    link?: string | null
): NotionRichTextOut[] {
    return chunkText(content).map((chunk) => {
        const rt: NotionRichTextOut = { type: 'text', text: { content: chunk } };
        if (link) rt.text.link = { url: link };
        const active = Object.fromEntries(Object.entries(annotations).filter(([, v]) => v));
        if (Object.keys(active).length > 0) rt.annotations = active;
        return rt;
    });
}

function isTag(node: DomNode): boolean {
    return node.type === 'tag' || node.type === 'script' || node.type === 'style';
}

function tagName(node: DomNode): string {
    return (node.name || '').toLowerCase();
}

function childElements(node: DomNode): DomNode[] {
    return (node.children || []).filter(isTag);
}

/** Plain text of a subtree. */
function textOf(node: DomNode): string {
    if (node.type === 'text') return node.data || '';
    return (node.children || []).map(textOf).join('');
}

function findAll(node: DomNode, name: string): DomNode[] {
    const out: DomNode[] = [];
    for (const child of node.children || []) {
        if (!isTag(child)) continue;
        if (tagName(child) === name) out.push(child);
        out.push(...findAll(child, name));
    }
    return out;
}

/** Flatten an inline DOM tree into Notion rich text with annotations. */
function inlineToRichText(
    nodes: DomNode[],
    inherited: NotionAnnotations = {},
    link: string | null = null
): NotionRichTextOut[] {
    const out: NotionRichTextOut[] = [];

    for (const node of nodes) {
        if (node.type === 'text') {
            if (node.data) out.push(...makeRichText(node.data, inherited, link));
            continue;
        }
        if (!isTag(node)) continue;

        const tag = tagName(node);
        const next: NotionAnnotations = { ...inherited };
        let nextLink = link;

        if (tag === 'strong' || tag === 'b') next.bold = true;
        else if (tag === 'em' || tag === 'i') next.italic = true;
        else if (tag === 's' || tag === 'del' || tag === 'strike') next.strikethrough = true;
        else if (tag === 'u') next.underline = true;
        else if (tag === 'code') next.code = true;
        else if (tag === 'a') nextLink = node.attribs?.href || null;
        else if (tag === 'br') {
            out.push(...makeRichText('\n', inherited, link));
            continue;
        } else if (tag === 'img') {
            // Inline images can't live in rich text — hoisted by the caller.
            continue;
        }

        out.push(...inlineToRichText(node.children || [], next, nextLink));
    }

    return out;
}

function textBlock(type: string, richText: NotionRichTextOut[], extra?: Record<string, unknown>): NotionBlockOut {
    return { object: 'block', type, [type]: { rich_text: richText, ...(extra || {}) } };
}

function imageBlock(url: string): NotionBlockOut {
    return { object: 'block', type: 'image', image: { type: 'external', external: { url } } };
}

/** Extract <img> tags from a subtree as standalone image blocks. */
function extractImages(node: DomNode): NotionBlockOut[] {
    const images: NotionBlockOut[] = [];
    const imgs = tagName(node) === 'img' ? [node] : findAll(node, 'img');
    for (const img of imgs) {
        const src = img.attribs?.src;
        // Notion external images must be http(s) URLs — data: URIs are rejected.
        if (src && /^https?:\/\//i.test(src)) {
            images.push(imageBlock(src));
        }
    }
    return images;
}

function listToBlocks(listEl: DomNode): NotionBlockOut[] {
    const isTaskList = listEl.attribs?.['data-type'] === 'taskList';
    const itemType = isTaskList
        ? 'to_do'
        : tagName(listEl) === 'ol'
          ? 'numbered_list_item'
          : 'bulleted_list_item';

    const blocks: NotionBlockOut[] = [];

    for (const li of childElements(listEl)) {
        if (tagName(li) !== 'li') continue;

        // Inline content = everything except nested lists.
        const inlineNodes = (li.children || []).filter(
            (n) => !(isTag(n) && (tagName(n) === 'ul' || tagName(n) === 'ol'))
        );
        const nestedLists = childElements(li).filter(
            (n) => tagName(n) === 'ul' || tagName(n) === 'ol'
        );

        const richText = inlineToRichText(inlineNodes);
        const children: NotionBlockOut[] = [];
        for (const nested of nestedLists) {
            children.push(...listToBlocks(nested));
        }

        const payload: Record<string, unknown> = { rich_text: richText };
        if (itemType === 'to_do') {
            payload.checked = li.attribs?.['data-checked'] === 'true';
        }
        if (children.length > 0) payload.children = children;

        blocks.push({ object: 'block', type: itemType, [itemType]: payload });
    }

    return blocks;
}

function tableToBlock(tableEl: DomNode): NotionBlockOut | null {
    const rows = findAll(tableEl, 'tr');
    if (rows.length === 0) return null;

    const hasHeader = childElements(rows[0]).some((cell) => tagName(cell) === 'th');
    let width = 0;
    const tableRows = rows.map((row) => {
        const cells = childElements(row)
            .filter((cell) => tagName(cell) === 'td' || tagName(cell) === 'th')
            .map((cell) => inlineToRichText(cell.children || []));
        width = Math.max(width, cells.length);
        return cells;
    });

    const tableWidth = Math.max(width, 1);
    return {
        object: 'block',
        type: 'table',
        table: {
            table_width: tableWidth,
            has_column_header: hasHeader,
            has_row_header: false,
            children: tableRows.map((cells) => {
                // Pad short rows — Notion requires exactly table_width cells.
                const padded = [...cells];
                while (padded.length < tableWidth) padded.push([]);
                return { object: 'block', type: 'table_row', table_row: { cells: padded } };
            }),
        },
    };
}

function elementToBlocks(el: DomNode): NotionBlockOut[] {
    const tag = tagName(el);

    switch (tag) {
        case 'p': {
            const images = extractImages(el);
            const richText = inlineToRichText(el.children || []);
            const blocks: NotionBlockOut[] = [];
            if (richText.length > 0 || images.length === 0) {
                blocks.push(textBlock('paragraph', richText));
            }
            blocks.push(...images);
            return blocks;
        }
        case 'h1':
            return [textBlock('heading_1', inlineToRichText(el.children || []))];
        case 'h2':
            return [textBlock('heading_2', inlineToRichText(el.children || []))];
        case 'h3':
        // Notion only has three heading levels.
        case 'h4':
        case 'h5':
        case 'h6':
            return [textBlock('heading_3', inlineToRichText(el.children || []))];
        case 'ul':
        case 'ol':
            return listToBlocks(el);
        case 'pre': {
            const codeEl = findAll(el, 'code')[0];
            const source = codeEl || el;
            const text = textOf(source);
            const classAttr = source.attribs?.class || '';
            const language = classAttr.match(/language-([\w-]+)/)?.[1] || 'plain text';
            return [
                {
                    object: 'block',
                    type: 'code',
                    code: { rich_text: makeRichText(text, {}), language },
                },
            ];
        }
        case 'blockquote':
            return [textBlock('quote', inlineToRichText(el.children || []))];
        case 'hr':
            return [{ object: 'block', type: 'divider', divider: {} }];
        case 'img':
            return extractImages(el);
        case 'figure': {
            const blocks = extractImages(el);
            const captionEl = findAll(el, 'figcaption')[0];
            const caption = captionEl ? textOf(captionEl) : '';
            if (blocks.length > 0 && caption) {
                (blocks[0].image as Record<string, unknown>).caption = makeRichText(caption, {});
            }
            return blocks;
        }
        case 'table': {
            const block = tableToBlock(el);
            return block ? [block] : [];
        }
        case 'div':
        case 'section':
        case 'article': {
            // Transparent containers — recurse.
            const blocks: NotionBlockOut[] = [];
            for (const child of childElements(el)) {
                blocks.push(...elementToBlocks(child));
            }
            return blocks;
        }
        default: {
            // Unknown element with text → paragraph; otherwise drop.
            const richText = inlineToRichText(el.children || []);
            return richText.length > 0 ? [textBlock('paragraph', richText)] : [];
        }
    }
}

/**
 * Convert an HTML document body into Notion blocks.
 * Returns at most `limit` top-level blocks (Notion append cap is 100 per
 * request — the sync service batches, but a hard ceiling protects us from
 * pathological documents).
 */
export function htmlToBlocks(html: string, limit = 1000): NotionBlockOut[] {
    const $ = cheerio.load(html);
    const body = $('body')[0] as unknown as DomNode | undefined;

    const blocks: NotionBlockOut[] = [];
    for (const el of body ? childElements(body) : []) {
        if (blocks.length >= limit) break;
        blocks.push(...elementToBlocks(el));
    }

    // Stray top-level text (no wrapping tag) → paragraph.
    if (blocks.length === 0 && body) {
        const text = textOf(body).trim();
        if (text) blocks.push(textBlock('paragraph', makeRichText(text, {})));
    }

    if (blocks.length === 0) {
        return [textBlock('paragraph', [])];
    }
    return blocks.slice(0, limit);
}
