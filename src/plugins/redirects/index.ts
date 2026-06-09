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
import type { Entry, JsonObject, PluginDefinition } from '@/types/index.js';

export type RedirectStatus = '301' | '302';

export type RedirectsOptions = {
    /** Auto-create a redirect when an entry's slug changes. Default: true. */
    generateOnSlugChange?: boolean;
    /**
     * Map an entry to the public path it is served at. Return null to skip.
     * Default: `/${slug}` (ignores type).
     */
    pathForEntry?: (entry: { type: string; slug: string | null }) => string | null;
};

export type RedirectMatch = {
    to: string;
    status: RedirectStatus;
};

type RedirectFields = {
    from?: unknown;
    to?: unknown;
    status?: unknown;
    enabled?: unknown;
};

const REDIRECT_TYPE = 'redirect';

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

        sdk: {
            // Resolve a request path to its redirect target. Public so a
            // frontend middleware can call it without a session.
            lookup: {
                access: 'public',
                handler: async (input, ctx): Promise<RedirectMatch | null> => {
                    const from =
                        input && typeof input === 'object' && 'from' in input
                            ? String((input as { from: unknown }).from)
                            : null;
                    if (!from) return null;

                    const { data } = await ctx.sdk.entries.query({
                        type: REDIRECT_TYPE,
                        limit: 'all',
                    });

                    const match = (data as Entry[]).find((entry) => {
                        const fields = (entry.fields ?? {}) as RedirectFields;
                        return fields.enabled !== false && fields.from === from;
                    });
                    if (!match) return null;

                    const fields = (match.fields ?? {}) as RedirectFields;
                    const status: RedirectStatus =
                        fields.status === '302' ? '302' : '301';
                    return { to: String(fields.to ?? ''), status };
                },
            },
        },
    };

    if (generateOnSlugChange) {
        definition.hooks = {
            // When an entry's slug changes, record a redirect old → new.
            'entry:afterUpdate': async (event, ctx) => {
                if (event.type === REDIRECT_TYPE) return;

                const oldSlug = event.entry.slug;
                const newSlug = event.data.slug;
                if (!oldSlug || !newSlug || oldSlug === newSlug) return;

                const from = pathForEntry({ type: event.type, slug: oldSlug });
                const to = pathForEntry({ type: event.type, slug: newSlug });
                if (!from || !to || from === to) return;

                const fields: JsonObject = { from, to, status: '301', enabled: true };
                await ctx.sdk.entries.create({
                    type: REDIRECT_TYPE,
                    title: `${from} → ${to}`,
                    fields,
                });
            },
        };
    }

    return definition;
});

export default redirects;
