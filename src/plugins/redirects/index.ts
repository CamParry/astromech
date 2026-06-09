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

import { definePlugin } from '@/index.js';
import type { PluginDefinition } from '@/types/index.js';
import { REDIRECT_TYPE } from './shared.js';
import { redirectsSdk } from './server/sdk.js';
import { slugChangeHooks } from './server/hooks.js';

export type { RedirectMatch, RedirectStatus } from './shared.js';

export type RedirectsOptions = {
    /** Auto-create a redirect when an entry's slug changes. Default: true. */
    generateOnSlugChange?: boolean;
    /**
     * Map an entry to the public path it is served at. Return null to skip.
     * Default: `/${slug}` (ignores type).
     */
    pathForEntry?: (entry: { type: string; slug: string | null }) => string | null;
};

function defaultPathForEntry(entry: { slug: string | null }): string | null {
    return entry.slug ? `/${entry.slug}` : null;
}

export const redirects = definePlugin<RedirectsOptions>((options) => {
    const generateOnSlugChange = options?.generateOnSlugChange ?? true;
    const pathForEntry = options?.pathForEntry ?? defaultPathForEntry;

    const definition: PluginDefinition = {
        package: '@astromech/redirects',
        version: '0.1.0',

        entries: {
            [REDIRECT_TYPE]: {
                single: 'Redirect',
                plural: 'Redirects',
                adminColumns: [
                    { field: 'from', label: 'From' },
                    { field: 'to', label: 'To' },
                    { field: 'status', label: 'Status' },
                ],
                fieldGroups: [
                    {
                        name: 'redirect',
                        label: 'Redirect',
                        placement: 'main',
                        priority: 0,
                        fields: [
                            {
                                name: 'from',
                                type: 'text',
                                label: 'From path',
                                required: true,
                            },
                            {
                                name: 'to',
                                type: 'text',
                                label: 'To path',
                                required: true,
                            },
                            {
                                name: 'status',
                                type: 'select',
                                label: 'Type',
                                defaultValue: '301',
                                options: [
                                    { value: '301', label: 'Permanent (301)' },
                                    { value: '302', label: 'Temporary (302)' },
                                ],
                            },
                            {
                                name: 'enabled',
                                type: 'boolean',
                                label: 'Enabled',
                                defaultValue: true,
                                checkboxLabel: 'This redirect is active',
                            },
                        ],
                    },
                ],
            },
        },

        sdk: redirectsSdk,
    };

    if (generateOnSlugChange) {
        definition.hooks = slugChangeHooks(pathForEntry);
    }

    return definition;
});

export default redirects;
