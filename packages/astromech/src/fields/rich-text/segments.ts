/**
 * Block segmentation for `translate`, which never serializes the document.
 * Each block's inline content goes out as Markdown and the reply comes back
 * into the same block, so structure is preserved by construction.
 */

import type { JSONContent } from '@tiptap/core';
import type { RichTextAllow } from '@/types/fields.js';
import { inlineToMarkdown, markdownToInline } from './markdown.js';

/** One translatable block, addressed by its index path from the document root. */
export type RichTextSegment = { path: number[]; text: string };

/**
 * List the blocks carrying translatable inline content, in document order.
 * Empty blocks and `codeBlock` content are left out — the first has nothing to
 * translate, the second must not be translated.
 */
export function extractRichTextSegments(
    doc: JSONContent | null | undefined,
    allow?: RichTextAllow
): RichTextSegment[] {
    const segments: RichTextSegment[] = [];
    if (doc === null || doc === undefined) return segments;

    walkTextBlocks(doc.content ?? [], [], (node, path) => {
        const text = inlineToMarkdown(node.content, allow);
        if (text !== '') segments.push({ path, text });
    });
    return segments;
}

/**
 * Return a copy of `doc` with one replacement per extracted segment, in order.
 * Throws on a length mismatch rather than half-writing the document.
 */
export function applyRichTextSegments(
    doc: JSONContent,
    replacements: string[],
    allow?: RichTextAllow
): JSONContent {
    const segments = extractRichTextSegments(doc, allow);
    if (segments.length !== replacements.length) {
        throw new Error(
            `Rich text needs ${String(segments.length)} replacement segment(s), got ${String(replacements.length)}`
        );
    }

    const next = structuredClone(doc);
    segments.forEach((segment, index) => {
        const block = nodeAt(next, segment.path);
        if (block === null) return;
        const content = restoreLinkAttrs(
            markdownToInline(replacements[index] ?? '', allow),
            block.content ?? []
        );
        if (content.length > 0) block.content = content;
        else delete block.content;
    });
    return next;
}

/**
 * Visit every node that holds inline content, depth first.
 * A node counts as a text block when any child is inline; `codeBlock` is never
 * visited and never descended into.
 */
function walkTextBlocks(
    nodes: JSONContent[],
    prefix: number[],
    visit: (node: JSONContent, path: number[]) => void
): void {
    nodes.forEach((node, index) => {
        if (node.type === 'codeBlock') return;
        const children = node.content;
        if (children === undefined || children.length === 0) return;

        const path = [...prefix, index];
        if (children.some(isInline)) visit(node, path);
        else walkTextBlocks(children, path, visit);
    });
}

/** Inline nodes are the leaves a block's text is made of. */
function isInline(node: JSONContent): boolean {
    return node.type === 'text' || node.type === 'hardBreak';
}

/** Follow an index path from the document root. */
function nodeAt(doc: JSONContent, path: number[]): JSONContent | null {
    let node: JSONContent | undefined = doc;
    for (const index of path) {
        node = node?.content?.[index];
    }
    return node ?? null;
}

/**
 * Put back the link attributes Markdown cannot carry, matched on `href`.
 * Without this a translate would drop `target` and `rel` from every link.
 */
function restoreLinkAttrs(parsed: JSONContent[], original: JSONContent[]): JSONContent[] {
    const byHref = new Map<string, Record<string, unknown>>();
    for (const node of original) {
        for (const mark of node.marks ?? []) {
            const href = mark.attrs?.['href'];
            if (
                mark.type === 'link' &&
                typeof href === 'string' &&
                mark.attrs !== undefined
            ) {
                byHref.set(href, mark.attrs as Record<string, unknown>);
            }
        }
    }
    if (byHref.size === 0) return parsed;

    for (const node of parsed) {
        for (const mark of node.marks ?? []) {
            if (mark.type !== 'link') continue;
            const attrs = byHref.get(String(mark.attrs?.['href'] ?? ''));
            if (attrs !== undefined) mark.attrs = { ...attrs };
        }
    }
    return parsed;
}
