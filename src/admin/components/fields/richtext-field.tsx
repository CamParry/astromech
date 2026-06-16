import React from 'react';
import type { JSONContent } from '@tiptap/core';
import type { BaseFieldProps } from '@/types/index.js';
import {
    RichTextEditor,
    type RichTextEditorProps,
} from '@/admin/components/ui/rich-text-editor.js';
import type { RichTextAllow } from '@/types/fields.js';

// ============================================================================
// Legacy coercion
// ============================================================================

/**
 * Coerce an incoming field value to a valid ProseMirror JSON doc.
 *
 * - If value is already an object (JSON doc), return it as-is.
 * - If value is a non-empty string (legacy HTML), wrap the plain text in a
 *   paragraph doc. Full HTML→JSON parse requires a DOM; in the browser we
 *   could use generateJSON but that adds a dependency and a DOM round-trip
 *   just to get into the editor. TipTap's editor will handle legacy HTML
 *   strings natively when passed as `content` — so we only wrap plain fallback
 *   here for null/undefined/non-string.
 * - null / undefined → undefined (empty editor).
 */
export function coerceToDoc(value: unknown): JSONContent | undefined {
    if (value === null || value === undefined) return undefined;

    if (typeof value === 'object' && !Array.isArray(value)) {
        return value as JSONContent;
    }

    if (typeof value === 'string' && value.trim() !== '') {
        // Legacy HTML string: pass through as a content string — TipTap editor
        // will parse it via its built-in HTML parser (which is DOM-based and
        // only runs in the browser). The editor accepts string content directly.
        // Return a minimal doc wrapping the text so the type stays JSONContent.
        // If the string looks like HTML we produce a single paragraph with the
        // raw text as a fallback — the actual re-hydration in the editor handles it.
        return {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [{ type: 'text', text: value }],
                },
            ],
        };
    }

    return undefined;
}

// ============================================================================
// Field component
// ============================================================================

export function RichtextField({
    name,
    value,
    field,
    onChange,
    disabled,
}: BaseFieldProps): React.ReactElement {
    const allow = field.allow as RichTextAllow | undefined;
    const docValue = coerceToDoc(value);

    function handleChange(json: JSONContent): void {
        onChange(name, json);
    }

    const editorProps: RichTextEditorProps = {
        onChange: handleChange,
        disabled: disabled ?? false,
        ...(allow !== undefined ? { allow } : {}),
        ...(docValue !== undefined ? { value: docValue } : {}),
    };

    return <RichTextEditor {...editorProps} />;
}
