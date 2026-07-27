/**
 * Permission bundles for composing into config roles. Keys resolve to
 * `plugin:redirects:entry:redirect:{action}` — exactly what the
 * mounted entries API checks (`plugin:{permissionNamespace}:entry:{type}:{action}`).
 *
 *   roles: { editor: { permissions: [...redirectsPermissions('manage')] } }
 */

import { definePermissionBundles } from 'astromech';
import { plugin } from '../plugin.js';
import { REDIRECT_TYPE } from '../types.js';

const t = REDIRECT_TYPE;

export const redirectsPermissions = definePermissionBundles(plugin.package, {
    manage: [
        `entry:${t}:read`,
        `entry:${t}:create`,
        `entry:${t}:update`,
        `entry:${t}:delete`,
    ],
    view: [`entry:${t}:read`],
});
