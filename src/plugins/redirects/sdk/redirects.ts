/**
 * Public SDK surface. No options involved, so a plain object rather than a
 * per-instance builder.
 */

import type { Entry } from '@/types/index.js';
import { defineServiceMethod } from '@/index.js';
import { REDIRECT_TYPE } from '../types.js';
import type { RedirectFields, RedirectMatch, RedirectStatus } from '../types.js';

export const redirectsSdk = {
    // Resolve a request path to its redirect target. Public so a frontend
    // middleware can call it without a session.
    lookup: defineServiceMethod<{ from: string }, RedirectMatch | null>({
        access: 'public',
        summary: 'Look up the redirect target for an incoming path.',
        mutates: false,
        handler: async (input, ctx): Promise<RedirectMatch | null> => {
            const from = typeof input?.from === 'string' ? input.from : null;
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
    }),
};
