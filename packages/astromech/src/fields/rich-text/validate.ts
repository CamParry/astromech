/**
 * Rich-text write validation — the value must be a ProseMirror document that
 * the field's own `allow` list admits.
 *
 * Pure: builds a schema from the same extensions the renderer uses.
 */

import { getSchema } from '@tiptap/core';
import { Node, type Schema } from '@tiptap/pm/model';
import { buildRichTextExtensions } from './extensions.js';
import type { FieldValidator, RichTextAllow } from '@/types/fields.js';

/**
 * Reject anything that is not a valid rich-text document for this field.
 * Reads `allow` off the field definition, so a value may be a perfectly good
 * document and still fail here when the field forbids one of its node types.
 */
export const validateRichText: FieldValidator = async (ctx) =>
    checkRichTextDocument(ctx.value, ctx.field.allow);

/**
 * Normalise an empty rendered document to null. A public-shape read renders an
 * empty field to `''`, which the pipeline treats as absent — without this it
 * would be stored as a string, the one bad value validation never sees.
 */
export const coerceRichText = (v: unknown): unknown => (v === '' ? null : v);

/**
 * Validate a value as a ProseMirror document against an `allow` list.
 * `fromJSON` rejects unknown node and mark types; `check()` adds the nested
 * content rules that `fromJSON` does not enforce on its own.
 */
export function checkRichTextDocument(
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

    return true;
}

/**
 * Cache schemas by `allow` list. Building one configures the whole StarterKit,
 * which is far too much work to repeat per field per write.
 */
const schemaCache = new Map<string, Schema>();

/** Build (or reuse) the ProseMirror schema for an `allow` list. */
function schemaFor(allow?: RichTextAllow): Schema {
    const key = JSON.stringify(allow ?? {});
    const cached = schemaCache.get(key);
    if (cached !== undefined) return cached;
    const schema = getSchema(buildRichTextExtensions(allow));
    schemaCache.set(key, schema);
    return schema;
}

/** Surface ProseMirror's own reason — it names the offending node or mark. */
function describe(error: unknown): string {
    const detail = error instanceof Error ? error.message : '';
    return detail === ''
        ? 'Must be a valid rich text document'
        : `Invalid rich text: ${detail}`;
}
