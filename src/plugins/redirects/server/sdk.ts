/**
 * SDK methods for @astromech/redirects. No options involved, so this is a
 * plain object rather than a per-instance builder.
 */

import type { Entry, PluginDefinition } from '@/types/index.js';
import { REDIRECT_TYPE } from '../shared.js';
import type { RedirectFields, RedirectMatch, RedirectStatus } from '../shared.js';

export const redirectsSdk: NonNullable<PluginDefinition['sdk']> = {
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

            const { data } = await ctx.entries.query({
                type: REDIRECT_TYPE,
                limit: 'all',
            });

            const match = (data as Entry[]).find((entry) => {
                const fields = (entry.fields ?? {}) as RedirectFields;
                return fields.enabled !== false && fields.from === from;
            });
            if (!match) return null;

            const fields = (match.fields ?? {}) as RedirectFields;
            const status: RedirectStatus = fields.status === '302' ? '302' : '301';
            return { to: String(fields.to ?? ''), status };
        },
    },
};
