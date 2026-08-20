import type { RichTextEditorProps } from '@/admin/components/ui/rich-text-editor';
import type { RichTextAllow } from '@/types/fields';
import type { BaseFieldProps } from '@/types/index';
import type { JSONContent } from '@tiptap/core';
import React from 'react';
import { RichTextEditor } from '@/admin/components/ui/rich-text-editor';

/**
 * Coerce an incoming field value to a valid ProseMirror JSON doc. Passes an
 * object through, wraps a legacy plain-text string in a paragraph doc, and
 * returns undefined for null/undefined (empty editor).
 */
export function coerceToDoc(value: unknown): JSONContent | undefined {
    if (value === null || value === undefined) return undefined;

    if (typeof value === 'object' && !Array.isArray(value)) {
        return value as JSONContent;
    }

    if (typeof value === 'string' && value.trim() !== '') {
        // Legacy string value: wrap as plain text so the return type stays JSONContent.
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

/** Field input wrapping `RichTextEditor`, coercing the stored value to a doc. */
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
