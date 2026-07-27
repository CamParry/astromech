/**
 * Permission bundles (for composing into config roles) and the plugin's
 * permission declarations (for the admin permission UI). Bundle keys resolve
 * to `plugin:demo_rating:{key}`.
 *
 *   roles: { editor: { permissions: [...ratingPermissions('view')] } }
 */

import { definePermissionBundles } from 'astromech';
import type { PluginPermission } from 'astromech';
import { plugin } from '../plugin.js';

export const ratingPermissions = definePermissionBundles(plugin.package, {
    view: ['view'],
});

export const ratingPermissionDefs: PluginPermission[] = [
    {
        key: 'view',
        label: 'View rating reports',
        description: 'See the ratings overview dashboard.',
    },
];
