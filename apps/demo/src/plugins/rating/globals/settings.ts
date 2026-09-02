/**
 * Ratings settings — a global edited at
 * `/cms/plugin/demo_rating/globals/settings`, stored under the qualified key
 * `demo_rating/settings`.
 */

import { defineGlobal } from 'astromech';
import * as fields from 'astromech/fields';

export const settingsGlobal = defineGlobal({
    key: 'settings',
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
