/**
 * @astromech/redirects — URL redirects as a first-class entry type, with a
 * public `lookup` service method and optional auto-redirect on slug change.
 * Frontend integration is a copy-paste middleware recipe (see README): the
 * plugin exposes data, the app owns the route.
 */

import { definePlugin, withDefaults } from 'astromech';
import type { ServiceInterface } from 'astromech';
import { REDIRECTS_PACKAGE } from './types.js';
import type { RedirectsOptions } from './types.js';
import { migrationProvider } from '../migrations/index.js';
import { redirectEntryType } from './entries/redirect.js';
import { redirectsTable } from './tables/redirects.js';
import { redirectsService } from './service/redirects.js';
import { slugChangeHook } from './hooks/slug-change.js';

declare module 'astromech' {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface AstromechPluginServices {
        redirects: ServiceInterface<typeof redirectsService>;
    }
}

export type { RedirectMatch, RedirectStatus, RedirectsOptions } from './types.js';

const DEFAULT_OPTIONS: Required<RedirectsOptions> = {
    generateOnSlugChange: true,
};

export const redirects = definePlugin((options?: RedirectsOptions) => {
    const { generateOnSlugChange } = withDefaults(DEFAULT_OPTIONS, options);

    return {
        package: REDIRECTS_PACKAGE,
        version: '0.1.0',
        label: 'Redirects',
        icon: 'Signpost',
        // No `permissions` declaration: the only service method is public, and
        // the redirect entry type's permissions are derived by core. A site
        // grants them with `entryPermissions('redirects/redirect', …)`.
        schema: [redirectsTable],
        migrations: migrationProvider,
        entries: [redirectEntryType],
        service: redirectsService,
        ...(generateOnSlugChange && { hooks: [slugChangeHook] }),
    };
});

export default redirects;
