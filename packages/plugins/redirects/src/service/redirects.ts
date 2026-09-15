/**
 * Public service surface. No options involved, so a plain object rather than a
 * per-instance builder.
 */

import type { RedirectFields, RedirectMatch, RedirectStatus } from '../types';
import type { Entry } from 'astromech';
import { defineServiceMethod, z } from 'astromech';
import { REDIRECT_TYPE } from '../types';

export const redirectsService = {
    /**
     * Resolve a request path to its redirect target. Public so a frontend
     * middleware can call it without a session.
     */
    lookup: defineServiceMethod({
        access: 'public',
        summary: 'Look up the redirect target for an incoming path.',
        input: z.object({ from: z.string() }),
        mutates: false,
        handler: async ({ from }, ctx): Promise<RedirectMatch | null> => {
            if (from === '') return null;

            // `ctx.entries` is the global entries service, so this plugin's own
            // type is addressed by its qualified id, built from context, never
            // from an identity import.
            const { data } = await ctx.entries.query({
                type: `${ctx.plugin.namespace}/${REDIRECT_TYPE}`,
                where: { from },
                limit: 'all',
            });

            // An enabled rule wins over a disabled one for the same path; a rule
            // with no `enabled` value counts as enabled.
            const match = (data as Entry[]).find(
                (entry) => (entry.fields as RedirectFields).enabled !== false
            );
            if (!match) return null;

            const fields = (match.fields ?? {}) as RedirectFields;
            const status: RedirectStatus = fields.status === '302' ? '302' : '301';
            return { to: String(fields.to ?? ''), status };
        },
    }),
};
