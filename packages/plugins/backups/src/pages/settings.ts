/**
 * Backups settings — an auto-rendered settings form at
 * `/admin/plugin/backups/settings`. Holds the retention count, which overrides
 * the `keep` option so an admin can change it without a redeploy.
 *
 * Values are stored as one object blob at `plugin:backups:/settings` in the
 * core settings table; `resolveKeep` in `../backup.ts` reads `retention` out
 * of it.
 */

import { defineAdminPage } from 'astromech';
import * as fields from 'astromech/fields';

/** The page path, and so the tail of the settings key. */
export const BACKUPS_SETTINGS_PATH = '/settings';

export const settingsPage = defineAdminPage({
    path: BACKUPS_SETTINGS_PATH,
    label: 'Settings',
    icon: 'Settings',
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
