/**
 * Permission bundles (for composing into config roles) and the plugin's
 * permission declarations (for the admin permission UI). Bundle keys resolve
 * to `plugin:seo:{key}`.
 *
 *   roles: { editor: { permissions: [...seoPermissions('view')] } }
 */

import { definePermissionBundles } from 'astromech';
import type { PluginPermission } from 'astromech';
import { plugin } from '../plugin.js';

export const seoPermissions = definePermissionBundles(plugin.package, {
    view: ['view'],
});

export const seoPermissionDefs: PluginPermission[] = [
    {
        key: 'view',
        label: 'View SEO overview',
        description: 'See the SEO health dashboard.',
    },
];
