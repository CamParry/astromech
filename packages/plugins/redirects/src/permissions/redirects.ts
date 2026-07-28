/**
 * Permission bundles for composing into config roles. Keys are declared bare
 * and namespaced by core, resolving to
 * `plugin:redirects:entry:redirect:{action}` — exactly what the mounted
 * entries API checks (`plugin:{permissionNamespace}:entry:{type}:{action}`).
 *
 *   roles: { editor: { permissions: [...redirects.permissions('manage')] } }
 */

import { REDIRECT_TYPE } from '../types.js';

const t = REDIRECT_TYPE;

export const redirectsPermissionBundles = {
    manage: [
        `entry:${t}:read`,
        `entry:${t}:create`,
        `entry:${t}:update`,
        `entry:${t}:delete`,
    ],
    view: [`entry:${t}:read`],
} as const;
