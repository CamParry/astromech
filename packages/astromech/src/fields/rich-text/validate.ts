/**
 * Rich-text write validation — the value must be a ProseMirror document that
 * the field's own `allow` list admits.
 *
 * Pure: builds a schema from the same extensions the renderer uses.
 */

import type { FieldValidator, RichTextAllow } from '@/types/fields';
import type { JSONContent } from '@tiptap/core';
import { Node } from '@tiptap/pm/model';
import { findUnsafeLink } from './safe-links';
import { schemaFor } from './schema';

/**
 * Reject anything that is not a valid rich-text document for this field.
 * Reads `allow` off the field definition, so a value may be a perfectly good
 * document and still fail here when the field forbids one of its node types.
 */
export const validateRichText: FieldValidator = async (ctx) =>
    validateRichTextDocument(ctx.value, ctx.field.allow);

/**
 * Normalise an empty rendered document to null. A public-shape read renders an
 * empty field to `''`, which the pipeline treats as absent — without this it
 * would be stored as a string, the one bad value validation never sees.
 */
export const coerceRichText = (v: unknown): unknown => (v === '' ? null : v);

/**
 * Validate a value as a ProseMirror document against an `allow` list.
 * `fromJSON` rejects unknown node and mark types; `check()` adds the nested
 * content rules; neither looks at link hrefs, so executable schemes are last.
 */
export function validateRichTextDocument(
    value: unknown,
    allow?: RichTextAllow
): true | string {
    // Called out separately because this is what a public-shape read returns:
    // the projection renders the document to HTML, so writing one back lands here.
    if (typeof value === 'string') {
        return 'Must be a rich text document, not an HTML string';
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return 'Must be a rich text document';
    }

    let node: Node;
    try {
        node = Node.fromJSON(schemaFor(allow), value);
    } catch (error) {
        return describe(error);
    }

    try {
        node.check();
    } catch (error) {
        return describe(error);
    }

    const unsafe = findUnsafeLink(value as JSONContent);
    if (unsafe !== null) {
        return `Invalid rich text: link href uses an unsafe scheme (${truncate(unsafe)})`;
    }

    return true;
}

/** Surface ProseMirror's own reason — it names the offending node or mark. */
function describe(error: unknown): string {
    const detail = error instanceof Error ? error.message : '';
    return detail === ''
        ? 'Must be a valid rich text document'
        : `Invalid rich text: ${detail}`;
}

/** Cap an echoed href so a base64 `data:` URI cannot bloat the message. */
function truncate(href: string): string {
    return href.length <= 80 ? href : `${href.slice(0, 80)}…`;
}
