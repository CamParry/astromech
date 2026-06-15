/**
 * SEO settings — an auto-rendered settings form at
 * `/admin/plugin/seo/settings`. Holds the default Open Graph image, returned
 * by the `meta` SDK method when an entry has no image of its own.
 *
 * Values are stored as one object blob at `plugin:astromech-seo:/settings`
 * in the core settings table.
 */

import { defineAdminPage } from '@/index.js';
import * as fields from '@/builders/fields.js';

export const settingsPage = defineAdminPage({
    path: '/settings',
    label: 'Settings',
    icon: 'Settings',
    fields: [
        fields.media('defaultOgImage', {
            label: 'Default Open Graph image',
            description:
                'Returned by the meta SDK method when an entry has no image of its own.',
        }),
    ],
});
