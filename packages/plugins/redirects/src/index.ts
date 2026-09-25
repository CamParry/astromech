/**
 * @astromech/redirects: redirect rules in the plugin's own table, a public
 * `lookup` for a site's middleware, an admin resource, and an optional redirect
 * on slug change. The site owns the middleware (see README).
 */

import type { RedirectsOptions } from './types';
import type { PluginDB, ServiceInterface } from 'astromech';
import { definePlugin, withDefaults } from 'astromech';
import { migrationProvider } from '../migrations/index';
import { slugChangeHook } from './hooks/slug-change';
import { redirectsPermissions } from './permissions/redirects';
import { redirectsResource } from './resources/redirects';
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
export type { RedirectRow } from './tables/redirects';

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
        tables,
        migrations: migrationProvider,
        permissions: redirectsPermissions,
        admin: { resources: [redirectsResource] },
        service: redirectsService,
        ...(generateOnSlugChange && { hooks: [slugChangeHook] }),
    };
});

export default redirects;
