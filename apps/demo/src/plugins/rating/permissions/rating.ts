/**
 * Permission bundles (for composing into config roles) and the plugin's
 * permission declarations (for the admin permission UI). Bundle keys resolve
 * to `plugin:demo-rating:{key}`.
 *
 *   roles: { editor: { permissions: [...ratingPermissions('view')] } }
 */

import { definePermissionBundles } from 'astromech';
import type { PluginPermission } from 'astromech';
import { PACKAGE } from '../manifest.js';

export const ratingPermissions = definePermissionBundles(PACKAGE, {
    view: ['view'],
});

export const ratingPermissionDefs: PluginPermission[] = [
    {
        key: 'view',
        label: 'View rating reports',
        description: 'See the ratings overview dashboard.',
    },
];
