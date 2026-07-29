/**
 * The permissions this plugin makes grantable. Bare keys; core namespaces them
 * to `plugin:seo:{key}`. A site enumerates the ones it grants:
 *
 *   roles: { editor: { permissions: [...seo.permissions('view')] } }
 */

import { definePermissions } from 'astromech';

export const seoPermissions = definePermissions({
    view: {
        label: 'View SEO overview',
        description: 'See the SEO health dashboard.',
    },
});
