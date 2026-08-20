/**
 * The permissions this plugin makes grantable. Bare keys; core namespaces them
 * to `plugin:demo_rating:{key}`. A site enumerates the ones it grants:
 *
 *   roles: { editor: { permissions: [...rating.permissions('view')] } }
 */

import { definePermissions } from 'astromech';

export const ratingPermissions = definePermissions({
    view: {
        label: 'View rating reports',
        description: 'See the ratings overview dashboard.',
    },
});
