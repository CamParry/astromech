/**
 * When an entry's resolved front-end URL changes (typically via its slug),
 * record a 301 redirect from the old path to the new one. The URL comes from
 * the entry type's `url` template — core's single source of truth — so we
 * never re-guess a path. Entry types without a `url` template are skipped
 * (which also makes the redirect type itself a no-op, avoiding recursion).
 */

import type { DefinedHook, JsonObject } from '@/types/index.js';
import { defineHook } from '@/index.js';
import { resolveEntryPath } from '@/core/entry-url.js';
import { REDIRECT_TYPE } from '../types.js';

export const slugChangeHook: DefinedHook = defineHook(
    'entry:afterUpdate',
    async (event, ctx) => {
        const template = ctx.config.entries[event.type]?.url;
        if (!template) return;

        const from = resolveEntryPath(template, event.entry);
        const to = resolveEntryPath(template, {
            slug: event.data.slug ?? event.entry.slug,
            fields: { ...event.entry.fields, ...(event.data.fields ?? {}) },
        });
        if (!from || !to || from === to) return;

        const fields: JsonObject = { from, to, status: '301', enabled: true };
        await ctx.entries.create({ type: REDIRECT_TYPE, fields });
    }
);
