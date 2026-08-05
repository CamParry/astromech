/**
 * Rich-text parse helper — HTML string → ProseMirror JSON.
 *
 * The inverse of `renderRichText`, over the same extensions, so anything
 * outside the field's `allow` list is dropped by the schema.
 */

import { parseHTML } from 'linkedom';
import { DOMParser } from '@tiptap/pm/model';
import type { JSONContent } from '@tiptap/core';
import type { RichTextAllow } from '@/types/fields.js';
import { schemaFor } from './schema.js';
import { stripUnsafeLinks } from './safe-links.js';

/**
 * Parse an HTML string into a ProseMirror JSON document.
 *
 * linkedom supplies a DOM with no Node built-ins, so this is Worker-safe.
 * Errors propagate: this is a write path, and an empty document loses content.
 */
export function parseRichText(html: string, allow?: RichTextAllow): JSONContent {
    // linkedom parses literally rather than implying a document structure, so
    // the `<html>` wrapper is what makes `document.body` the parsed fragment.
    const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
    const json = DOMParser.fromSchema(schemaFor(allow))
        .parse(document.body)
        .toJSON() as JSONContent;
    return stripUnsafeLinks(json);
}
