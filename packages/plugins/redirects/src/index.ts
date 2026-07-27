/**
 * @astromech/redirects — URL redirects as a first-class entry type, with a
 * public `lookup` SDK method and optional auto-redirect on slug change.
 * Frontend integration is a copy-paste middleware recipe (see README): the
 * plugin exposes data, the app owns the route.
 */

import { definePlugin, withDefaults } from 'astromech';
import type { SdkInterface } from 'astromech';
import { plugin } from './plugin.js';
import type { RedirectsOptions } from './types.js';
import { migrationProvider } from '../migrations/index.js';
import { redirectEntryType } from './entries/redirect.js';
import { redirectsTable } from './schema/redirects.js';
import { redirectsSdk } from './sdk/redirects.js';
import { slugChangeHook } from './hooks/slug-change.js';

declare module 'astromech' {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface AstromechPluginSdks {
        redirects: SdkInterface<typeof redirectsSdk>;
    }
}

export type { RedirectMatch, RedirectStatus, RedirectsOptions } from './types.js';
export { redirectsPermissions } from './permissions/redirects.js';

const DEFAULT_OPTIONS: Required<RedirectsOptions> = {
    generateOnSlugChange: true,
};

export const redirects = definePlugin<RedirectsOptions>(plugin, (options) => {
    const { generateOnSlugChange } = withDefaults(DEFAULT_OPTIONS, options);

    return {
        schema: [redirectsTable],
        migrations: migrationProvider,
        entries: [redirectEntryType],
        sdk: redirectsSdk,
        ...(generateOnSlugChange && { hooks: [slugChangeHook] }),
    };
});

export default redirects;
