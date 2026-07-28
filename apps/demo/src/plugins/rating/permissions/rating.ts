/**
 * Permission bundles (for composing into config roles) and the plugin's
 * permission declarations (for the admin permission UI). Bundle keys resolve
 * to `plugin:demo_rating:{key}`.
 *
 *   roles: { editor: { permissions: [...rating.permissions('view')] } }
 */

import type { PluginPermission } from 'astromech';

export const ratingPermissionBundles = {
    view: ['view'],
} as const;

export const ratingPermissionDefs: PluginPermission[] = [
    {
        key: 'view',
        label: 'View rating reports',
        description: 'See the ratings overview dashboard.',
    },
];
