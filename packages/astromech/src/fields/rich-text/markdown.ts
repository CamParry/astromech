/**
 * Markdown converters for rich text: an inline pair for `translate` (marks
 * only) and a block pair for `transform`/`generate`. Hand-written over
 * ProseMirror JSON — TipTap's `generateJSON` needs a DOM and cannot run here.
 */

import type { JSONContent } from '@tiptap/core';
import type { RichTextAllow } from '@/types/fields.js';

type MarkJSON = { type: string; attrs?: Record<string, unknown> };
type ListKind = 'bullet' | 'ordered';
type Cursor = { lines: string[]; i: number };
type PendingItem = { text: string; children: JSONContent[] };

/**
 * Serialize one block's inline content to Markdown.
 * Marks outside the closed set — or outside `allow` — degrade to plain text.
 */
export function inlineToMarkdown(
    nodes: JSONContent[] | undefined,
    allow?: RichTextAllow
): string {
    if (nodes === undefined) return '';
    const markdown = nodes.map((node) => serializeInlineNode(node, allow)).join('');
    return escapeBlockStart(markdown);
}

/**
 * Parse inline Markdown back into inline nodes.
 * Never throws: anything malformed degrades to the literal characters.
 */
export function markdownToInline(markdown: string, allow?: RichTextAllow): JSONContent[] {
    return parseInline(markdown, allow, []);
}

/** Serialize a whole document to Markdown for the operations that restructure. */
export function docToMarkdown(
    doc: JSONContent | null | undefined,
    allow?: RichTextAllow
): string {
    if (doc === null || doc === undefined) return '';
    return serializeBlocks(doc.content ?? [], allow).join('\n\n');
}

/**
 * Parse Markdown into a document built only from nodes `allow` permits.
 * A forbidden construct falls back to a paragraph rather than an invalid node.
 */
export function markdownToDoc(markdown: string, allow?: RichTextAllow): JSONContent {
    const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
    const content = parseBlocks({ lines, i: 0 }, allow);
    return {
        type: 'doc',
        content: content.length > 0 ? content : [{ type: 'paragraph' }],
    };
}

// ============================================================================
// Inline serialization
// ============================================================================

/** Marks the converters understand, in ProseMirror schema order. */
const MARK_ORDER = ['link', 'bold', 'code', 'italic'];

/** Serialize a single inline node, wrapping its text in its marks' delimiters. */
function serializeInlineNode(node: JSONContent, allow?: RichTextAllow): string {
    if (node.type === 'hardBreak') return '\\\n';
    if (node.type !== 'text' || typeof node.text !== 'string' || node.text === '') {
        return '';
    }

    const marks = supportedMarks(node.marks, allow);
    if (marks.some((mark) => mark.type === 'code')) return codeSpan(node.text);

    let out = escapeText(node.text);
    if (marks.some((mark) => mark.type === 'italic')) out = `_${out}_`;
    if (marks.some((mark) => mark.type === 'bold')) out = `**${out}**`;

    const link = marks.find((mark) => mark.type === 'link');
    if (link !== undefined) out = `[${out}](${escapeHref(link.attrs?.['href'])})`;
    return out;
}

/** Keep only the marks this converter can express and `allow` permits. */
function supportedMarks(
    marks: JSONContent['marks'],
    allow: RichTextAllow | undefined
): MarkJSON[] {
    if (marks === undefined) return [];
    const kept = marks.filter(
        (mark) => MARK_ORDER.includes(mark.type) && markAllowed(mark.type, allow)
    ) as MarkJSON[];
    // `code` excludes every other mark in the schema, so it can never share a node.
    const code = kept.find((mark) => mark.type === 'code');
    if (code !== undefined) return [code];
    return [...kept].sort(byMarkOrder);
}

/** Wrap code text in a backtick fence longer than any run it contains. */
function codeSpan(text: string): string {
    const runs = text.match(/`+/g) ?? [];
    const fence = '`'.repeat(runs.reduce((max, run) => Math.max(max, run.length), 0) + 1);
    const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
    return `${fence}${pad}${text}${pad}${fence}`;
}

/** Escape every character that would otherwise read as inline markup. */
function escapeText(text: string): string {
    return text.replace(/[\\*_`[\]]/g, (char) => `\\${char}`);
}

/** Escape the characters that would close a link destination early. */
function escapeHref(href: unknown): string {
    return typeof href === 'string' ? href.replace(/[\\()]/g, (char) => `\\${char}`) : '';
}

/**
 * Escape a leading block marker so a paragraph beginning `#` or `-` survives
 * the block parser as text. `*` and `_` are already escaped everywhere.
 */
function escapeBlockStart(markdown: string): string {
    return /^(?:#{1,6}|[-+>]|\d+[.)])/.test(markdown) ? `\\${markdown}` : markdown;
}

// ============================================================================
// Inline parsing
// ============================================================================

/** Tokenize inline Markdown, carrying the enclosing marks into nested spans. */
function parseInline(
    source: string,
    allow: RichTextAllow | undefined,
    marks: MarkJSON[]
): JSONContent[] {
    const out: JSONContent[] = [];
    let buffer = '';
    let i = 0;

    const flush = (): void => {
        if (buffer === '') return;
        out.push(textNode(buffer, marks));
        buffer = '';
    };

    while (i < source.length) {
        const char = source.charAt(i);

        if (char === '\\') {
            const next = source.charAt(i + 1);
            if (next === '\n') {
                flush();
                out.push({ type: 'hardBreak' });
                i += 2;
            } else if (next === '') {
                buffer += '\\';
                i += 1;
            } else {
                buffer += next;
                i += 2;
            }
            continue;
        }

        if (char === '\n') {
            flush();
            out.push({ type: 'hardBreak' });
            i += 1;
            continue;
        }

        if (char === '`') {
            const code = readCode(source, i, allow, marks);
            if (code !== null) {
                flush();
                if (code.node !== null) out.push(code.node);
                i = code.next;
                continue;
            }
        }

        if (char === '*' || char === '_') {
            const emphasis = readEmphasis(source, i, allow, marks);
            if (emphasis !== null) {
                flush();
                out.push(...emphasis.nodes);
                i = emphasis.next;
                continue;
            }
        }

        if (char === '[') {
            const link = readLink(source, i, allow, marks);
            if (link !== null) {
                flush();
                out.push(...link.nodes);
                i = link.next;
                continue;
            }
        }

        buffer += char;
        i += 1;
    }

    flush();
    return mergeText(out);
}

/** Read a backtick code span; its content is literal, so nothing is unescaped. */
function readCode(
    source: string,
    start: number,
    allow: RichTextAllow | undefined,
    marks: MarkJSON[]
): { node: JSONContent | null; next: number } | null {
    const fence = runLength(source, start, '`');
    const close = findExactRun(source, start + fence, '`', fence);
    if (close === -1) return null;

    let text = source.slice(start + fence, close);
    if (text.length > 1 && text.startsWith(' ') && text.endsWith(' ')) {
        text = text.slice(1, -1);
    }
    const node =
        text === '' ? null : textNode(text, addMark(marks, { type: 'code' }, allow));
    return { node, next: close + fence };
}

/** Read a `*`/`_` emphasis run; three or more delimiters mean bold and italic. */
function readEmphasis(
    source: string,
    start: number,
    allow: RichTextAllow | undefined,
    marks: MarkJSON[]
): { nodes: JSONContent[]; next: number } | null {
    const char = source.charAt(start);
    const open = runLength(source, start, char);
    const close = findDelimiter(source, start + open, char, Math.min(open, 2));
    if (close === -1) return null;

    const take = Math.min(open, runLength(source, close, char), 3);
    let inner = marks;
    if (take >= 2) inner = addMark(inner, { type: 'bold' }, allow);
    if (take !== 2) inner = addMark(inner, { type: 'italic' }, allow);

    return {
        nodes: parseInline(source.slice(start + take, close), allow, inner),
        next: close + take,
    };
}

/** Read a `[label](href)` link, parsing the label so nested marks survive. */
function readLink(
    source: string,
    start: number,
    allow: RichTextAllow | undefined,
    marks: MarkJSON[]
): { nodes: JSONContent[]; next: number } | null {
    const labelEnd = matchBracket(source, start, '[', ']');
    if (labelEnd === -1 || source.charAt(labelEnd + 1) !== '(') return null;

    const hrefEnd = matchBracket(source, labelEnd + 1, '(', ')');
    if (hrefEnd === -1) return null;

    const href = unescapeText(source.slice(labelEnd + 2, hrefEnd)).trim();
    const inner = addMark(marks, { type: 'link', attrs: { href } }, allow);
    return {
        nodes: parseInline(source.slice(start + 1, labelEnd), allow, inner),
        next: hrefEnd + 1,
    };
}

/** Add a mark to a set, honouring `allow` and the schema's `code` exclusion. */
function addMark(
    marks: MarkJSON[],
    mark: MarkJSON,
    allow: RichTextAllow | undefined
): MarkJSON[] {
    if (!markAllowed(mark.type, allow)) return marks;
    if (marks.some((existing) => existing.type === 'code')) return marks;
    if (mark.type === 'code') return [mark];
    if (marks.some((existing) => existing.type === mark.type)) return marks;
    return [...marks, mark].sort(byMarkOrder);
}

/** Build a text node, omitting an empty mark list. */
function textNode(text: string, marks: MarkJSON[]): JSONContent {
    return marks.length > 0 ? { type: 'text', text, marks } : { type: 'text', text };
}

/** Merge neighbouring text nodes that carry the same marks. */
function mergeText(nodes: JSONContent[]): JSONContent[] {
    const out: JSONContent[] = [];
    for (const node of nodes) {
        const previous = out[out.length - 1];
        if (
            node.type === 'text' &&
            previous?.type === 'text' &&
            JSON.stringify(previous.marks ?? []) === JSON.stringify(node.marks ?? [])
        ) {
            previous.text = `${previous.text ?? ''}${node.text ?? ''}`;
            continue;
        }
        out.push(node);
    }
    return out;
}

// ============================================================================
// Block serialization
// ============================================================================

/** Serialize block nodes, dropping the ones Markdown cannot express. */
function serializeBlocks(nodes: JSONContent[], allow?: RichTextAllow): string[] {
    const out: string[] = [];
    for (const node of nodes) {
        const markdown = serializeBlock(node, allow);
        if (markdown !== '') out.push(markdown);
    }
    return out;
}

/** Serialize one block node; unknown types fall back to their inline content. */
function serializeBlock(node: JSONContent, allow?: RichTextAllow): string {
    switch (node.type) {
        case 'heading': {
            const inline = inlineToMarkdown(node.content, allow);
            if (!nodeAllowed('heading', allow)) return inline;
            const level = Math.min(Math.max(Number(node.attrs?.['level'] ?? 1), 1), 6);
            return `${'#'.repeat(level)} ${inline}`;
        }
        case 'codeBlock': {
            const language = node.attrs?.['language'];
            const tag = typeof language === 'string' ? language : '';
            return `\`\`\`${tag}\n${plainText(node.content)}\n\`\`\``;
        }
        case 'blockquote':
            return quote(serializeBlocks(node.content ?? [], allow).join('\n\n'));
        case 'bulletList':
        case 'orderedList':
            return serializeList(node, allow, 0);
        case 'horizontalRule':
            return '---';
        default:
            return inlineToMarkdown(node.content, allow);
    }
}

/** Serialize a list and its nested lists, two spaces of indent per level. */
function serializeList(
    node: JSONContent,
    allow: RichTextAllow | undefined,
    depth: number
): string {
    const ordered = node.type === 'orderedList';
    const start = ordered ? Number(node.attrs?.['start'] ?? 1) : 1;
    const indent = '  '.repeat(depth);
    const lines: string[] = [];

    (node.content ?? []).forEach((item, index) => {
        const texts: string[] = [];
        const nested: string[] = [];
        for (const child of item.content ?? []) {
            if (child.type === 'bulletList' || child.type === 'orderedList') {
                nested.push(serializeList(child, allow, depth + 1));
            } else {
                const markdown = serializeBlock(child, allow);
                if (markdown !== '') texts.push(markdown);
            }
        }
        const marker = ordered ? `${start + index}. ` : '- ';
        const continuation = `\\\n${indent}${' '.repeat(marker.length)}`;
        lines.push(`${indent}${marker}${texts.join(continuation)}`);
        lines.push(...nested);
    });

    return lines.join('\n');
}

/** Prefix every line of a block's Markdown with a blockquote marker. */
function quote(markdown: string): string {
    return markdown
        .split('\n')
        .map((line) => (line === '' ? '>' : `> ${line}`))
        .join('\n');
}

/** Concatenate raw text for a code block, where markup is not interpreted. */
function plainText(nodes: JSONContent[] | undefined): string {
    return (nodes ?? [])
        .map((node) => (node.type === 'hardBreak' ? '\n' : (node.text ?? '')))
        .join('');
}

// ============================================================================
// Block parsing
// ============================================================================

/** Consume lines into block nodes until the cursor runs out. */
function parseBlocks(cursor: Cursor, allow?: RichTextAllow): JSONContent[] {
    const out: JSONContent[] = [];

    while (cursor.i < cursor.lines.length) {
        const line = cursor.lines[cursor.i] ?? '';
        if (line.trim() === '') {
            cursor.i += 1;
            continue;
        }
        const rest = line.trimStart();

        if (/^(?:`{3,}|~{3,})/.test(rest)) {
            out.push(parseFence(cursor, allow));
            continue;
        }

        const heading = /^(#{1,6})\s+(.*)$/.exec(rest);
        if (heading !== null) {
            cursor.i += 1;
            out.push(makeHeading((heading[1] ?? '').length, heading[2] ?? '', allow));
            continue;
        }

        if (rest.startsWith('>')) {
            out.push(...parseQuote(cursor, allow));
            continue;
        }

        if (/^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(rest)) {
            cursor.i += 1;
            if (nodeAllowed('horizontalRule', allow))
                out.push({ type: 'horizontalRule' });
            continue;
        }

        const marker = matchMarker(rest);
        if (marker !== null) {
            const level = Math.floor((line.length - rest.length) / 2);
            out.push(...parseList(cursor, level, marker.kind, allow));
            continue;
        }

        out.push(parseParagraph(cursor, allow));
    }

    return out;
}

/** Read a fenced code block; a forbidden one keeps its lines as literal text. */
function parseFence(cursor: Cursor, allow: RichTextAllow | undefined): JSONContent {
    const opening = /^(`{3,}|~{3,})(.*)$/.exec(
        (cursor.lines[cursor.i] ?? '').trimStart()
    );
    const fence = opening?.[1] ?? '```';
    const language = (opening?.[2] ?? '').trim();
    cursor.i += 1;

    const body: string[] = [];
    while (cursor.i < cursor.lines.length) {
        const line = cursor.lines[cursor.i] ?? '';
        cursor.i += 1;
        const trimmed = line.trim();
        if (trimmed.startsWith(fence.charAt(0)) && /^(?:`{3,}|~{3,})$/.test(trimmed)) {
            break;
        }
        body.push(line);
    }

    const text = body.join('\n');
    if (!nodeAllowed('codeBlock', allow)) return literalParagraph(text);
    return {
        type: 'codeBlock',
        ...(language === '' ? {} : { attrs: { language } }),
        ...(text === '' ? {} : { content: [{ type: 'text', text }] }),
    };
}

/** Read consecutive `>` lines and parse their content as nested blocks. */
function parseQuote(cursor: Cursor, allow: RichTextAllow | undefined): JSONContent[] {
    const inner: string[] = [];
    while (cursor.i < cursor.lines.length) {
        const rest = (cursor.lines[cursor.i] ?? '').trimStart();
        if (!rest.startsWith('>')) break;
        inner.push(rest.replace(/^>\s?/, ''));
        cursor.i += 1;
    }

    const children = parseBlocks({ lines: inner, i: 0 }, allow);
    if (!nodeAllowed('blockquote', allow)) return children;
    return [
        {
            type: 'blockquote',
            content: children.length > 0 ? children : [{ type: 'paragraph' }],
        },
    ];
}

/** Read a list and its nested lists; indent is two spaces per level. */
function parseList(
    cursor: Cursor,
    level: number,
    kind: ListKind,
    allow: RichTextAllow | undefined
): JSONContent[] {
    const items: PendingItem[] = [];
    let start: number | null = null;

    while (cursor.i < cursor.lines.length) {
        const line = cursor.lines[cursor.i] ?? '';
        if (line.trim() === '') break;

        const rest = line.trimStart();
        const lineLevel = Math.min(
            Math.floor((line.length - rest.length) / 2),
            level + 1
        );
        const marker = matchMarker(rest);
        const last = items[items.length - 1];

        if (marker === null) {
            if (last === undefined || isBlockStart(rest)) break;
            last.text = joinContinuation(last.text, rest);
            cursor.i += 1;
            continue;
        }

        if (lineLevel < level || (lineLevel === level && marker.kind !== kind)) break;

        if (lineLevel > level) {
            if (last === undefined) break;
            const before = cursor.i;
            last.children.push(...parseList(cursor, level + 1, marker.kind, allow));
            if (cursor.i === before) break;
            continue;
        }

        if (start === null && marker.number !== undefined) start = marker.number;
        items.push({ text: marker.text, children: [] });
        cursor.i += 1;
    }

    if (items.length === 0) return [];
    const content = items.map((item) => ({
        type: 'listItem',
        content: [paragraph(markdownToInline(item.text, allow)), ...item.children],
    }));

    const type = kind === 'ordered' ? 'orderedList' : 'bulletList';
    if (!nodeAllowed(type, allow)) return content.flatMap((item) => item.content);
    return [
        {
            type,
            ...(start !== null && start !== 1 ? { attrs: { start } } : {}),
            content,
        },
    ];
}

/** Read a paragraph, folding soft-wrapped lines and trailing-backslash breaks. */
function parseParagraph(cursor: Cursor, allow: RichTextAllow | undefined): JSONContent {
    let text = (cursor.lines[cursor.i] ?? '').trimStart();
    cursor.i += 1;

    while (cursor.i < cursor.lines.length) {
        const line = cursor.lines[cursor.i] ?? '';
        const rest = line.trimStart();
        if (rest === '' || isBlockStart(rest)) break;
        text = joinContinuation(text, rest);
        cursor.i += 1;
    }

    return paragraph(markdownToInline(text, allow));
}

/** Build a heading, or a plain paragraph when the field forbids headings. */
function makeHeading(
    level: number,
    text: string,
    allow: RichTextAllow | undefined
): JSONContent {
    const content = markdownToInline(text, allow);
    if (!nodeAllowed('heading', allow)) return paragraph(content);
    return {
        type: 'heading',
        attrs: { level: Math.min(Math.max(level, 1), 6) },
        ...(content.length > 0 ? { content } : {}),
    };
}

/** Match a bullet or ordered list marker at the start of a line. */
function matchMarker(
    rest: string
): { kind: ListKind; text: string; number?: number } | null {
    const bullet = /^[-*+]\s+(.*)$/.exec(rest);
    if (bullet !== null) return { kind: 'bullet', text: bullet[1] ?? '' };

    const ordered = /^(\d{1,9})[.)]\s+(.*)$/.exec(rest);
    if (ordered !== null) {
        return {
            kind: 'ordered',
            text: ordered[2] ?? '',
            number: Number(ordered[1] ?? '1'),
        };
    }
    return null;
}

/** Does this line open a block of its own rather than continue the current one? */
function isBlockStart(rest: string): boolean {
    return (
        /^(?:`{3,}|~{3,})/.test(rest) ||
        /^#{1,6}\s/.test(rest) ||
        rest.startsWith('>') ||
        /^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(rest) ||
        matchMarker(rest) !== null
    );
}

/** A trailing backslash means a hard break; anything else is a soft wrap. */
function joinContinuation(text: string, next: string): string {
    return endsWithOddBackslash(text) ? `${text}\n${next}` : `${text} ${next}`;
}

/** Build a paragraph, omitting empty content so the node stays canonical. */
function paragraph(content: JSONContent[]): JSONContent {
    return content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' };
}

/** Turn raw lines into one paragraph of literal text separated by hard breaks. */
function literalParagraph(text: string): JSONContent {
    const content: JSONContent[] = [];
    text.split('\n').forEach((line, index) => {
        if (index > 0) content.push({ type: 'hardBreak' });
        if (line !== '') content.push({ type: 'text', text: line });
    });
    return paragraph(content);
}

// ============================================================================
// Shared helpers
// ============================================================================

/** Is this node type permitted by the field's allow list? */
function nodeAllowed(
    key: keyof RichTextAllow,
    allow: RichTextAllow | undefined
): boolean {
    return allow === undefined || allow[key] !== false;
}

/** Is this mark type permitted by the field's allow list? */
function markAllowed(type: string, allow: RichTextAllow | undefined): boolean {
    return nodeAllowed(type as keyof RichTextAllow, allow);
}

/** Sort marks into schema order so a round trip is byte-stable. */
function byMarkOrder(a: MarkJSON, b: MarkJSON): number {
    return MARK_ORDER.indexOf(a.type) - MARK_ORDER.indexOf(b.type);
}

/** Count the run of `char` starting at `start`. */
function runLength(source: string, start: number, char: string): number {
    let length = 0;
    while (source.charAt(start + length) === char) length += 1;
    return length;
}

/** Find a run of exactly `length` backticks, skipping longer runs. */
function findExactRun(
    source: string,
    from: number,
    char: string,
    length: number
): number {
    let i = from;
    while (i < source.length) {
        if (source.charAt(i) !== char) {
            i += 1;
            continue;
        }
        const run = runLength(source, i, char);
        if (run === length) return i;
        i += run;
    }
    return -1;
}

/** Find a closing delimiter run, ignoring escapes and code spans. */
function findDelimiter(source: string, from: number, char: string, min: number): number {
    let i = from;
    while (i < source.length) {
        const current = source.charAt(i);
        if (current === '\\') {
            i += 2;
            continue;
        }
        if (current === '`') {
            const fence = runLength(source, i, '`');
            const close = findExactRun(source, i + fence, '`', fence);
            i = close === -1 ? i + fence : close + fence;
            continue;
        }
        if (current === char) {
            const run = runLength(source, i, char);
            if (run >= min) return i;
            i += run;
            continue;
        }
        i += 1;
    }
    return -1;
}

/** Find the bracket closing the one at `start`, counting nesting and escapes. */
function matchBracket(
    source: string,
    start: number,
    open: string,
    close: string
): number {
    let depth = 0;
    let i = start;
    while (i < source.length) {
        const current = source.charAt(i);
        if (current === '\\') {
            i += 2;
            continue;
        }
        if (current === open) depth += 1;
        else if (current === close) {
            depth -= 1;
            if (depth === 0) return i;
        }
        i += 1;
    }
    return -1;
}

/** Drop one level of backslash escaping. */
function unescapeText(text: string): string {
    return text.replace(/\\([\s\S])/g, '$1');
}

/** Does the text end with an odd number of backslashes (an escaped newline)? */
function endsWithOddBackslash(text: string): boolean {
    return (/\\*$/.exec(text)?.[0].length ?? 0) % 2 === 1;
}
