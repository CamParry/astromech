/**
 * Permission bundles for composing into config roles. Keys resolve to
 * `plugin:astromech-redirects:entry:redirect:{action}` — exactly what the
 * mounted entries API checks (`plugin:{permissionNamespace}:entry:{type}:{action}`).
 *
 *   roles: { editor: { permissions: [...redirectsPermissions('manage')] } }
 */

import { definePermissionBundles } from 'astromech';
import { PACKAGE } from '../manifest.js';
import { REDIRECT_TYPE } from '../types.js';

const t = REDIRECT_TYPE;

export const redirectsPermissions = definePermissionBundles(PACKAGE, {
    manage: [
        `entry:${t}:read`,
        `entry:${t}:create`,
        `entry:${t}:update`,
        `entry:${t}:delete`,
    ],
    view: [`entry:${t}:read`],
});
