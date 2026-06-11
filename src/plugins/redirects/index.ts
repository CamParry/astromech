/**
 * @astromech/redirects
 *
 * Manages URL redirects as a first-class entry type, exposes a public `lookup`
 * SDK method (works identically over local DB and HTTP), and — optionally —
 * auto-creates a redirect whenever an entry's slug changes.
 *
 * Frontend integration is a copy-paste middleware recipe (see README): the
 * plugin exposes data; the app owns the route. Plugins cannot register routes
 * outside `/api`.
 *
 * This is the Phase 18a validator: it stress-tests the plugin runtime spine
 * (entry types, the open hook registry + afterUpdate, and SDK/RPC parity) with
 * near-zero UI.
 */

import { definePlugin, definePermissionBundles } from '@/index.js';
import type { PluginDefinition } from '@/types/index.js';
import type { RedirectsOptions } from './shared.js';
import { REDIRECT_TYPE, defaultPathForEntry } from './shared.js';
import { redirectEntryType } from './entries.js';
import { redirectsTable } from './schema.js';
import { redirectsSdk } from './server/sdk.js';
import { slugChangeHooks } from './server/hooks.js';

export type { RedirectMatch, RedirectStatus, RedirectsOptions } from './shared.js';

/**
 * Permission bundles for composing into config roles. Keys resolve to
 * `plugin:astromech-redirects:entry:redirect:{action}` — exactly what the
 * mounted entries API checks (`plugin:{permissionNamespace}:entry:{type}:{action}`).
 *
 *   roles: { editor: { permissions: [...redirectsPermissions('manage')] } }
 */
export const redirectsPermissions = definePermissionBundles('@astromech/redirects', {
    manage: [
        'entry:redirect:read',
        'entry:redirect:create',
        'entry:redirect:update',
        'entry:redirect:delete',
    ],
    view: ['entry:redirect:read'],
});

export const redirects = definePlugin<RedirectsOptions>((options) => {
    const generateOnSlugChange = options?.generateOnSlugChange ?? true;
    const pathForEntry = options?.pathForEntry ?? defaultPathForEntry;

    const definition: PluginDefinition = {
        package: '@astromech/redirects',
        version: '0.1.0',

        schemaModule: 'astromech/plugins/redirects/schema',
        schema: { redirects: redirectsTable },

        entries: {
            [REDIRECT_TYPE]: redirectEntryType,
        },

        sdk: redirectsSdk,
    };

    if (generateOnSlugChange) {
        definition.hooks = slugChangeHooks(pathForEntry);
    }

    return definition;
});

export default redirects;
