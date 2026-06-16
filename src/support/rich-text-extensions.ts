/**
 * Shared TipTap extension factory for rich-text fields.
 *
 * Imported by:
 *   - src/admin/components/ui/rich-text-extensions.ts (browser editor)
 *   - src/core/render-rich-text.ts (server/worker static renderer)
 *
 * StarterKit v3 bundles Link and Underline; configure them via StarterKit
 * options rather than standalone imports to avoid duplicate schemas.
 *
 * The `document`, `text`, and `gapcursor` StarterKit options only accept
 * `false` (no config object) — omit them to keep the default (enabled).
 */

import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { Placeholder } from '@tiptap/extension-placeholder';
import type { Extensions } from '@tiptap/core';
import type { RichTextAllow } from '@/types/fields.js';

/**
 * Return the extension array for rich-text editing/rendering.
 *
 * `allow` is optional; when absent everything is enabled.
 * Setting a key to `false` removes that node/mark from the ProseMirror schema.
 */
export function buildRichTextExtensions(
    allow?: RichTextAllow,
    placeholderText?: string
): Extensions {
    const on = (key: keyof RichTextAllow): boolean =>
        allow === undefined || allow[key] !== false;

    const extensions: Extensions = [
        StarterKit.configure({
            heading: on('heading') ? { levels: [1, 2, 3, 4, 5, 6] } : false,
            bold: on('bold') ? {} : false,
            italic: on('italic') ? {} : false,
            strike: on('strike') ? {} : false,
            code: on('code') ? {} : false,
            codeBlock: on('codeBlock') ? {} : false,
            bulletList: on('bulletList') ? {} : false,
            orderedList: on('orderedList') ? {} : false,
            blockquote: on('blockquote') ? {} : false,
            horizontalRule: on('horizontalRule') ? {} : false,
            // StarterKit v3 bundles these — configure here, not as standalone.
            link: on('link') ? { openOnClick: false } : false,
            underline: on('underline') ? {} : false,
        }),
    ];

    if (on('textAlign')) {
        extensions.push(TextAlign.configure({ types: ['heading', 'paragraph'] }));
    }

    if (placeholderText !== undefined) {
        extensions.push(Placeholder.configure({ placeholder: placeholderText }));
    }

    return extensions;
}
