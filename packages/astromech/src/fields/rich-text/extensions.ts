/**
 * Shared TipTap extension factory for rich-text fields — one factory feeds
 * the editor, the static renderer and the schema cache, so an `allow` list
 * means the same thing everywhere. Configure via StarterKit, not standalone imports.
 */

import type { RichTextAllow } from '@/types/fields';
import type { Extensions } from '@tiptap/core';
import { Extension } from '@tiptap/core';
import { Placeholder } from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import StarterKit from '@tiptap/starter-kit';

// TextBalance extension — inline style; always on

declare module '@tiptap/core' {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface Commands<ReturnType> {
        textBalance: { toggleTextBalance: () => ReturnType };
    }
}

const TextBalance = Extension.create({
    name: 'textBalance',
    addOptions() {
        return { types: ['paragraph', 'heading'] };
    },
    addGlobalAttributes() {
        return [
            {
                types: this.options.types as string[],
                attributes: {
                    balance: {
                        default: false,
                        parseHTML: (el: Element) =>
                            (el as HTMLElement).style?.getPropertyValue('text-wrap') ===
                            'balance',
                        renderHTML: (attrs: Record<string, unknown>) =>
                            attrs['balance'] ? { style: 'text-wrap: balance' } : {},
                    },
                },
            },
        ];
    },
    addCommands() {
        return {
            toggleTextBalance:
                () =>
                ({ editor, commands }) => {
                    const type = editor.isActive('heading') ? 'heading' : 'paragraph';
                    return commands.updateAttributes(type, {
                        balance: !editor.getAttributes(type)['balance'],
                    });
                },
        };
    },
});

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
            // Default target/_blank and rel from HTMLAttributes are nulled out so
            // links without explicit target/rel emit neither attribute.
            // New-tab links set target="_blank" rel="noopener noreferrer" per-link.
            link: on('link')
                ? { openOnClick: false, HTMLAttributes: { target: null, rel: null } }
                : false,
            underline: on('underline') ? {} : false,
        }),
    ];

    if (on('textAlign')) {
        extensions.push(TextAlign.configure({ types: ['heading', 'paragraph'] }));
    }

    // TextBalance — always on, not gated behind allow.
    extensions.push(TextBalance);

    if (placeholderText !== undefined) {
        extensions.push(Placeholder.configure({ placeholder: placeholderText }));
    }

    return extensions;
}
