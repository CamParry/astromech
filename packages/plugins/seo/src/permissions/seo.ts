/**
 * Permission bundles (for composing into config roles) and the plugin's
 * permission declarations (for the admin permission UI). Bundle keys resolve
 * to `plugin:seo:{key}`.
 *
 *   roles: { editor: { permissions: [...seo.permissions('view')] } }
 */

import type { PluginPermission } from 'astromech';

export const seoPermissionBundles = {
    view: ['view'],
} as const;

export const seoPermissionDefs: PluginPermission[] = [
    {
        key: 'view',
        label: 'View SEO overview',
        description: 'See the SEO health dashboard.',
    },
];
