/**
 * Entry hooks for @astromech/redirects. Built per-instance because the hook
 * closes over the resolved `pathForEntry` option.
 */

import type { DefinedHook, JsonObject } from '@/types/index.js';
import { defineHook } from '@/index.js';
import { REDIRECT_TYPE } from '../shared.js';

export type PathForEntry = (entry: {
    type: string;
    slug: string | null;
}) => string | null;

export function slugChangeHooks(pathForEntry: PathForEntry): DefinedHook[] {
    return [
        // When an entry's slug changes, record a redirect old to new.
        defineHook('entry:afterUpdate', async (event, ctx) => {
            const oldSlug = event.entry.slug;
            const newSlug = event.data.slug;
            if (!oldSlug || !newSlug || oldSlug === newSlug) return;

            const from = pathForEntry({ type: event.type, slug: oldSlug });
            const to = pathForEntry({ type: event.type, slug: newSlug });
            if (!from || !to || from === to) return;

            const fields: JsonObject = { from, to, status: '301', enabled: true };
            await ctx.entries.create({ type: REDIRECT_TYPE, fields });
        }),
    ];
}
