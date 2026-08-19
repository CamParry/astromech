/**
 * The ProseMirror schema for a rich-text field's `allow` list.
 *
 * Shared by validation (JSON in) and parsing (HTML in), so both directions
 * admit exactly the same nodes and marks.
 */

import type { RichTextAllow } from '@/types/fields';
import type { Schema } from '@tiptap/pm/model';
import { getSchema } from '@tiptap/core';
import { buildRichTextExtensions } from './extensions';

/** Build (or reuse) the ProseMirror schema for an `allow` list. */
export function schemaFor(allow?: RichTextAllow): Schema {
    const key = JSON.stringify(allow ?? {});
    const cached = schemaCache.get(key);
    if (cached !== undefined) return cached;
    const schema = getSchema(buildRichTextExtensions(allow));
    schemaCache.set(key, schema);
    return schema;
}

/**
 * Cache schemas by `allow` list. Building one configures the whole StarterKit,
 * which is far too much work to repeat per field per write.
 */
const schemaCache = new Map<string, Schema>();
