/**
 * Permission bundles (for composing into config roles) and the plugin's
 * permission declarations (for the admin permission UI). Bundle keys resolve
 * to `plugin:astromech-seo:{key}`.
 *
 *   roles: { editor: { permissions: [...seoPermissions('view')] } }
 */

import { definePermissionBundles } from '@/index.js';
import type { PluginPermission } from '@/types/index.js';
import { PACKAGE } from '../manifest.js';

export const seoPermissions = definePermissionBundles(PACKAGE, {
    view: ['view'],
});

export const seoPermissionDefs: PluginPermission[] = [
    {
        key: 'view',
        label: 'View SEO overview',
        description: 'See the SEO health dashboard.',
    },
];
