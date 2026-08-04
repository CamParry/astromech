/**
 * Content service method descriptors — the declared shape + permission + effect
 * for each content operation. The single source the HTTP transport enforces
 * against (via permissionsFor) and the method manifest reads.
 *
 * `input` is the METHOD's argument object, not the HTTP body: `type` and `id`
 * are path parameters on the wire, so the body schema alone would describe half
 * the call.
 */

import { z } from 'zod';
import type { ServiceMethodDescriptor } from '@/types/index.js';

/**
 * The target every operation shares. Declared above the catalogue because the
 * catalogue is an eager object that reads it.
 */
const contentTarget = z.object({
    type: z.string().describe('Entry type id, e.g. `article` or `blog/post`.'),
    id: z.string().describe('Id of the entry to rewrite.'),
    paths: z
        .array(z.string())
        .optional()
        .describe(
            'Instance paths to restrict the rewrite to, e.g. `sections[a1].heading`. ' +
                'A container path selects its whole subtree. Omitted means every ' +
                'eligible field on the entry.'
        ),
});

export const contentDescriptors = {
    translate: {
        summary:
            'Translate one entry into another locale. Structure is preserved — rich ' +
            'text goes back into the same blocks — and fields marked non-translatable ' +
            'or private, plus every non-text field, are never sent to the model. ' +
            'Nothing is published: a locale that already exists is staged on that ' +
            'entry for review, and a locale that does not yet exist becomes an ' +
            'unpublished sibling of the source.',
        input: contentTarget.extend({
            locale: z.string().describe('Locale code to translate into, e.g. `de`.'),
            instruction: z
                .string()
                .optional()
                .describe(
                    'Extra direction for the model. Defaults to a plain instruction ' +
                        'to translate while preserving meaning, tone and formatting.'
                ),
        }),
        permission: 'content:translate',
        mutates: true,
    },
    transform: {
        summary:
            'Rewrite one entry’s existing text in its own locale under an instruction ' +
            '— tone, length, clarity. Rich text may be restructured, and a field with ' +
            'no text is skipped rather than invented. Nothing is published: the ' +
            'rewrite is staged on the entry and a human merges it.',
        input: contentTarget.extend({
            instruction: z
                .string()
                .describe(
                    'What to do to the text, e.g. "make this shorter and less formal".'
                ),
        }),
        permission: 'content:transform',
        mutates: true,
    },
    generate: {
        summary:
            'Write one entry’s text fields from an instruction, replacing any current ' +
            'value wholesale. Unlike transform it also fills fields that are empty. ' +
            'Nothing is published: the result is staged on the entry and a human ' +
            'merges it.',
        input: contentTarget.extend({
            instruction: z
                .string()
                .describe('What to write, e.g. "a summary of the body, two sentences".'),
        }),
        permission: 'content:generate',
        mutates: true,
    },
} satisfies Record<string, ServiceMethodDescriptor>;
