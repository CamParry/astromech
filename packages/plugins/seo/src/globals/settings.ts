/**
 * SEO settings — a global edited at `/cms/plugin/seo/globals/settings`. Holds
 * the default Open Graph image, returned by the `meta` service method when an
 * entry has no image of its own.
 */

import { defineGlobal } from 'astromech';
import * as fields from 'astromech/fields';

export const settingsGlobal = defineGlobal({
    key: 'settings',
    label: 'Settings',
    icon: 'Settings',
    // No draft state: a setting takes effect when it is saved. The `meta`
    // method reads it through `ctx.globals`, which reads the full shape.
    statuses: false,
    fields: [
        fields.media('defaultOgImage', {
            label: 'Default Open Graph image',
            description:
                'Returned by the meta service method when an entry has no image of its own.',
        }),
    ],
});
