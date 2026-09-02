/**
 * Backups settings — a global edited at
 * `/cms/plugin/backups/globals/settings`. Holds the retention count, which
 * overrides the `keep` option so an admin can change it without a redeploy.
 */

import { defineGlobal } from 'astromech';
import * as fields from 'astromech/fields';

/** The global's key, qualified as `<namespace>/<key>` when it is addressed. */
export const BACKUPS_SETTINGS_KEY = 'settings';

export const settingsGlobal = defineGlobal({
    key: BACKUPS_SETTINGS_KEY,
    label: 'Settings',
    icon: 'Settings',
    // No draft state: a setting takes effect when it is saved. The cron
    // handler reads it through `ctx.globals`, which reads the full shape.
    statuses: false,
    fields: [
        fields.number('retention', {
            label: 'Backups to keep',
            description:
                'How many backup artifacts to retain. Older ones are deleted after each successful run. Leave empty to use the value the site was configured with.',
            min: 1,
            step: 1,
        }),
    ],
});
