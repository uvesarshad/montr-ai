import { describe, it, expect } from 'vitest';
import { blocksToHtml } from './blocks-to-html';
import { htmlToBlocks, type NotionBlockOut } from './html-to-blocks';
import type { NotionBlock, NotionRichText } from '@/lib/services/notion.service';

function rt(text: string, annotations: Partial<NotionRichText['annotations']> = {}, href?: string): NotionRichText {
    return {
        plain_text: text,
        href: href ?? null,
        annotations: {
            bold: false,
            italic: false,
            strikethrough: false,
            code: false,
            ...annotations,
        },
    };
}

function block(type: string, richText: NotionRichText[], extra: Record<string, unknown> = {}): NotionBlock {
    return { type, [type]: { rich_text: richText, ...extra } } as NotionBlock;
}

describe('blocksToHtml', () => {
    it('renders paragraphs, headings and inline annotations', () => {
        const html = blocksToHtml([
            block('heading_1', [rt('Title')]),
            block('paragraph', [rt('plain '), rt('bold', { bold: true }), rt(' and '), rt('code', { code: true })]),
        ]);
        expect(html).toBe('<h1>Title</h1><p>plain <strong>bold</strong> and <code>code</code></p>');
    });

    it('escapes HTML in text content', () => {
        const html = blocksToHtml([block('paragraph', [rt('<script>alert(1)</script>')])]);
        expect(html).toContain('&lt;script&gt;');
        expect(html).not.toContain('<script>');
    });

    it('groups consecutive list items into one list', () => {
        const html = blocksToHtml([
            block('bulleted_list_item', [rt('one')]),
            block('bulleted_list_item', [rt('two')]),
            block('paragraph', [rt('break')]),
            block('numbered_list_item', [rt('first')]),
        ]);
        expect(html).toBe(
            '<ul><li><p>one</p></li><li><p>two</p></li></ul><p>break</p><ol><li><p>first</p></li></ol>'
        );
    });

    it('renders to_do items as a task list', () => {
        const html = blocksToHtml([
            block('to_do', [rt('done')], { checked: true }),
            block('to_do', [rt('open')], { checked: false }),
        ]);
        expect(html).toContain('data-type="taskList"');
        expect(html).toContain('data-checked="true"');
        expect(html).toContain('data-checked="false"');
    });

    it('renders code blocks with language, links, images, quotes, dividers and tables', () => {
        const html = blocksToHtml([
            block('code', [rt('const x = 1;')], { language: 'typescript' }),
            block('paragraph', [rt('link', {}, 'https://example.com')]),
            block('image', [], { type: 'external', external: { url: 'https://img.example.com/a.png' } }),
            block('quote', [rt('wisdom')]),
            { type: 'divider', divider: {} } as NotionBlock,
            {
                type: 'table',
                table: { has_column_header: true },
                children: [
                    { type: 'table_row', table_row: { cells: [[rt('H1')], [rt('H2')]] } },
                    { type: 'table_row', table_row: { cells: [[rt('a')], [rt('b')]] } },
                ],
            } as unknown as NotionBlock,
        ]);
        expect(html).toContain('<pre><code class="language-typescript">const x = 1;</code></pre>');
        expect(html).toContain('<a href="https://example.com">link</a>');
        expect(html).toContain('<img src="https://img.example.com/a.png"');
        expect(html).toContain('<blockquote><p>wisdom</p></blockquote>');
        expect(html).toContain('<hr>');
        expect(html).toContain('<th><p>H1</p></th>');
        expect(html).toContain('<td><p>a</p></td>');
    });

    it('flattens layout containers and keeps nested list children', () => {
        const nested: NotionBlock = {
            ...block('bulleted_list_item', [rt('parent')]),
            children: [block('bulleted_list_item', [rt('child')])],
        };
        const html = blocksToHtml([nested]);
        expect(html).toBe('<ul><li><p>parent</p><ul><li><p>child</p></li></ul></li></ul>');
    });
});

describe('htmlToBlocks', () => {
    function findBlocks(blocks: NotionBlockOut[], type: string): NotionBlockOut[] {
        return blocks.filter((b) => b.type === type);
    }

    it('converts paragraphs, headings and inline marks', () => {
        const blocks = htmlToBlocks('<h2>Head</h2><p>plain <strong>bold</strong> <em>it</em></p>');
        expect(blocks[0].type).toBe('heading_2');
        const para = blocks[1] as { paragraph: { rich_text: { text: { content: string }; annotations?: { bold?: boolean } }[] } };
        expect(para.paragraph.rich_text.map((r) => r.text.content).join('')).toBe('plain bold it');
        expect(para.paragraph.rich_text[1].annotations?.bold).toBe(true);
    });

    it('converts lists including nesting and task lists', () => {
        const blocks = htmlToBlocks(
            '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>done</p></li></ul>' +
                '<ol><li><p>one</p><ul><li><p>sub</p></li></ul></li></ol>'
        );
        const todo = findBlocks(blocks, 'to_do')[0] as { to_do: { checked: boolean } };
        expect(todo.to_do.checked).toBe(true);
        const numbered = findBlocks(blocks, 'numbered_list_item')[0] as {
            numbered_list_item: { children?: NotionBlockOut[] };
        };
        expect(numbered.numbered_list_item.children?.[0].type).toBe('bulleted_list_item');
    });

    it('converts code blocks with language, quotes, dividers, images and links', () => {
        const blocks = htmlToBlocks(
            '<pre><code class="language-python">print(1)</code></pre>' +
                '<blockquote><p>q</p></blockquote><hr>' +
                '<p><img src="https://img.example.com/x.png"></p>' +
                '<p><a href="https://example.com">site</a></p>'
        );
        const code = findBlocks(blocks, 'code')[0] as {
            code: { language: string; rich_text: { text: { content: string } }[] };
        };
        expect(code.code.language).toBe('python');
        expect(code.code.rich_text[0].text.content).toBe('print(1)');
        expect(findBlocks(blocks, 'quote')).toHaveLength(1);
        expect(findBlocks(blocks, 'divider')).toHaveLength(1);
        const image = findBlocks(blocks, 'image')[0] as { image: { external: { url: string } } };
        expect(image.image.external.url).toBe('https://img.example.com/x.png');
        const linkPara = findBlocks(blocks, 'paragraph').at(-1) as {
            paragraph: { rich_text: { text: { link?: { url: string } | null } }[] };
        };
        expect(linkPara.paragraph.rich_text[0].text.link?.url).toBe('https://example.com');
    });

    it('rejects data: image URIs and pads short table rows', () => {
        const blocks = htmlToBlocks(
            '<p><img src="data:image/png;base64,AAAA"></p>' +
                '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td></tr></table>'
        );
        expect(findBlocks(blocks, 'image')).toHaveLength(0);
        const table = findBlocks(blocks, 'table')[0] as {
            table: { table_width: number; has_column_header: boolean; children: { table_row: { cells: unknown[][] } }[] };
        };
        expect(table.table.table_width).toBe(2);
        expect(table.table.has_column_header).toBe(true);
        expect(table.table.children[1].table_row.cells).toHaveLength(2);
    });

    it('splits text beyond Notion’s 2000-char rich text cap', () => {
        const blocks = htmlToBlocks(`<p>${'x'.repeat(4500)}</p>`);
        const para = blocks[0] as { paragraph: { rich_text: { text: { content: string } }[] } };
        expect(para.paragraph.rich_text).toHaveLength(3);
        expect(para.paragraph.rich_text[0].text.content).toHaveLength(2000);
    });

    it('never returns zero blocks (Notion requires ≥1 child)', () => {
        expect(htmlToBlocks('').length).toBeGreaterThan(0);
    });
});

describe('round trip', () => {
    it('survives blocks → HTML → blocks for the common structures', () => {
        const original: NotionBlock[] = [
            block('heading_1', [rt('Doc title')]),
            block('paragraph', [rt('Hello '), rt('world', { bold: true })]),
            block('bulleted_list_item', [rt('item one')]),
            block('bulleted_list_item', [rt('item two')]),
            block('code', [rt('let a = 2;')], { language: 'javascript' }),
        ];

        const html = blocksToHtml(original);
        const roundTripped = htmlToBlocks(html);

        expect(roundTripped.map((b) => b.type)).toEqual([
            'heading_1',
            'paragraph',
            'bulleted_list_item',
            'bulleted_list_item',
            'code',
        ]);
        const p = roundTripped[1] as {
            paragraph: { rich_text: { text: { content: string }; annotations?: { bold?: boolean } }[] };
        };
        expect(p.paragraph.rich_text.map((r) => r.text.content).join('')).toBe('Hello world');
        expect(p.paragraph.rich_text.at(-1)?.annotations?.bold).toBe(true);
    });
});
