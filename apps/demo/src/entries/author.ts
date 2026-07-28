/**
 * The `author` entry type, split out of `astromech.config.ts` to demonstrate
 * `defineEntryType` — the helper for entry types that want their own module.
 * The record key in the config (`author`) is still what names the type.
 */

import { defineEntryType } from 'astromech';
import * as fields from 'astromech/fields';

export const author = defineEntryType({
    single: 'Author',
    plural: 'Authors',
    icon: 'UserRound',
    translatable: true,
    url: '/authors/{slug}',
    fields: {
        main: [
            fields.richtext('bio', { label: 'Bio' }),
            fields.text('role', { label: 'Role' }),
            fields.repeater('socials', {
                label: 'Social Links',
                fields: [
                    fields.select('platform', {
                        label: 'Platform',
                        options: ['twitter', 'github', 'linkedin', 'website'],
                    }),
                    fields.url('url', { label: 'URL' }),
                ],
            }),
        ],
        sidebar: [fields.media('avatar', { label: 'Avatar', translatable: false })],
    },
});
