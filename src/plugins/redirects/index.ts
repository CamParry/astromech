/**
 * @astromech/redirects — URL redirects as a first-class entry type, with a
 * public `lookup` SDK method and optional auto-redirect on slug change.
 * Frontend integration is a copy-paste middleware recipe (see README): the
 * plugin exposes data, the app owns the route.
 */

import { definePlugin, withDefaults } from '@/index.js';
import type { PluginDefinition, SdkInterface } from '@/types/index.js';
import { PACKAGE, VERSION, LABEL, ICON, SCHEMA_MODULE } from './manifest.js';
import type { RedirectsOptions } from './types.js';
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

export const redirects = definePlugin<RedirectsOptions>((options) => {
    const { generateOnSlugChange } = withDefaults(DEFAULT_OPTIONS, options);

    const definition: PluginDefinition = {
        package: PACKAGE,
        version: VERSION,
        label: LABEL,
        icon: ICON,
        schemaModule: SCHEMA_MODULE,
        schema: [redirectsTable],
        entries: [redirectEntryType],
        sdk: redirectsSdk,
    };

    if (generateOnSlugChange) {
        definition.hooks = [slugChangeHook];
    }

    return definition;
});

export default redirects;
