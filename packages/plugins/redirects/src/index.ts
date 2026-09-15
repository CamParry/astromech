/**
 * @astromech/redirects — URL redirects as a first-class entry type, with a
 * public `lookup` service method and optional auto-redirect on slug change.
 * Frontend integration is a copy-paste middleware recipe (see README): the
 * plugin exposes data, the app owns the route.
 */

import type { RedirectsOptions } from './types';
import type { PluginDB, ServiceInterface } from 'astromech';
import { definePlugin, withDefaults } from 'astromech';
import { migrationProvider } from '../migrations/index';
import { redirectEntryType } from './entries/redirect';
import { slugChangeHook } from './hooks/slug-change';
import { redirectsService } from './service/redirects';
import { redirectsTable } from './tables/redirects';
import { REDIRECTS_PACKAGE } from './types';

/** Listed once: the definition and the `AstromechPluginTables` augmentation both read it. */
const tables = [redirectsTable] as const;

declare module 'astromech' {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface AstromechPluginServices {
        redirects: ServiceInterface<typeof redirectsService>;
    }

    // Puts this plugin's tables on a site's `db` handle.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/consistent-type-definitions
    interface AstromechPluginTables extends PluginDB<typeof tables> {}
}

export type { RedirectMatch, RedirectStatus, RedirectsOptions } from './types';

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
        tables,
        migrations: migrationProvider,
        entries: [redirectEntryType],
        service: redirectsService,
        ...(generateOnSlugChange && { hooks: [slugChangeHook] }),
    };
});

export default redirects;
