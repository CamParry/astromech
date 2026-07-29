/**
 * The permissions this plugin makes grantable. Keys are declared **bare** — no
 * prefix, no `:` — and core namespaces them to `plugin:demo_rating:{key}`. The
 * declaration feeds both the `astromech permissions` catalogue and the
 * factory's grant accessor, so a site enumerates exactly what it hands out:
 *
 *   roles: { editor: { permissions: [...rating.permissions('view')] } }
 *
 * Nothing is granted automatically. `admin` holds `*` and so already has this;
 * every other role opts in.
 */

import { definePermissions } from 'astromech';

export const ratingPermissions = definePermissions({
    view: {
        label: 'View rating reports',
        description: 'See the ratings overview dashboard.',
    },
});
