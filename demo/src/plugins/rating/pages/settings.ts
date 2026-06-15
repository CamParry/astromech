/**
 * Ratings settings — an auto-rendered settings form at
 * `/admin/plugin/rating/settings`. Values are stored as one object blob at
 * `plugin:demo-rating:/settings` in the core settings table.
 */

import { defineAdminPage } from 'astromech';
import * as fields from 'astromech/fields';

export const settingsPage = defineAdminPage({
    path: '/settings',
    label: 'Settings',
    icon: 'Settings',
    fields: [
        fields.number('minimumQuality', {
            label: 'Minimum quality to publish',
            description: 'Pages below this rating show a warning.',
        }),
        fields.boolean('showInListing', {
            label: 'Show ratings in entry lists',
        }),
    ],
});
