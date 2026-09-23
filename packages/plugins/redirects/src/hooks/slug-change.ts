/**
 * When an entry's resolved front-end path changes (typically via its slug),
 * record a 301 redirect from the old path to the new one, keeping the rules
 * free of loops and one hop deep the way WordPress's Redirection plugin and
 * Yoast do. The path comes from the entry type's `url` template, core's single
 * source of truth, so the plugin never guesses one. Entry types without a
 * `url` template are skipped, which makes the redirect type itself a no-op, so
 * the hook's own writes to redirect rules never recurse.
 *
 * The writes are separate calls: a plugin context offers no transaction to
 * group them in.
 */

import type { RedirectFields } from '../types';
import type { Entry, Hook, JsonObject, PluginContext } from 'astromech';
import { defineHook, resolveEntryPath } from 'astromech';
import { REDIRECT_TYPE } from '../types';

/** Enabled rules matching `where`; a rule with no `enabled` value counts as enabled. */
async function enabledRules(
    ctx: PluginContext,
    type: string,
    where: { from?: string; to?: string }
): Promise<Entry[]> {
    // The plugin's own rules, whatever their visibility.
    const { data } = await ctx.entries.query({ type, where, limit: 'all', full: true });
    return (data as Entry[]).filter(
        (rule) => (rule.fields as RedirectFields).enabled !== false
    );
}

export const slugChangeHook: Hook = defineHook(
    'entry:afterUpdate',
    async (event, ctx) => {
        const template = ctx.config.entryTypes[event.type]?.url;
        if (!template) return;

        const from = resolveEntryPath(template, event.entry);
        const to = resolveEntryPath(template, {
            slug: event.data.slug ?? event.entry.slug,
            fields: { ...event.entry.fields, ...(event.data.fields ?? {}) },
        });
        if (!from || !to || from === to) return;

        // Qualified id, built from context: `ctx.entries` is the global service.
        const type = `${ctx.plugin.namespace}/${REDIRECT_TYPE}`;

        // The new path is live again, so no rule may redirect away from it.
        const rulesFromNewPath = await enabledRules(ctx, type, { from: to });
        if (rulesFromNewPath.length > 0) {
            await ctx.entries.delete({
                type,
                id: rulesFromNewPath.map((rule) => rule.id),
            });
        }

        // Rules that led to the old path now lead straight to the new one. None
        // of them starts at the new path (those were deleted above), so none
        // becomes a loop.
        const rulesToOldPath = await enabledRules(ctx, type, { to: from });
        if (rulesToOldPath.length > 0) {
            await ctx.entries.update({
                type,
                id: rulesToOldPath.map((rule) => rule.id),
                data: { fields: { to } },
            });
        }

        // One enabled rule per path: a rule already redirecting the old path,
        // whether recorded earlier or made by hand, stays as it is.
        if ((await enabledRules(ctx, type, { from })).length > 0) return;

        const fields: JsonObject = { from, to, status: '301', enabled: true };
        await ctx.entries.create({ type, data: { fields } });
    }
);
