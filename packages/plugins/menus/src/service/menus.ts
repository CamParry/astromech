/**
 * Service method for @astromech/menus. Reads a menu's global, drops disabled
 * nodes, resolves entry refs to front-end URLs via the entry type's `url`
 * template, and returns a clean tree.
 */

import type { MenuConfig, MenuItem } from '../types';
import type { AnyServiceMethod, Entry, PluginContext } from 'astromech';
import { defineServiceMethod, resolveEntryUrl, z } from 'astromech';

/** Raw stored node shape (with reserved underscore keys). */
type RawNode = {
    _id: string;
    _disabled?: boolean;
    label?: string;
    entry?: string;
    url?: string;
    newTab?: boolean;
    _children?: RawNode[];
};

/** Resolve an entry's front-end URL from its type's `url` template, or null. */
async function resolveEntryRef(
    ctx: PluginContext,
    entryId: string,
    locale: string | undefined
): Promise<string | null> {
    // Try every entry type, since the relationship field stores only the id.
    for (const [type, config] of Object.entries(ctx.config.entries)) {
        if (!config.url) continue;
        try {
            // The reader's locale first; an entry with no row for it falls back
            // to the default locale, so a menu never loses an item to a missing
            // translation.
            const entry =
                ((await ctx.entries.get({
                    type,
                    id: entryId,
                    ...(locale ? { locale } : {}),
                })) as Entry | null) ??
                (locale
                    ? ((await ctx.entries.get({ type, id: entryId })) as Entry | null)
                    : null);
            if (entry) return resolveEntryUrl(config.url, entry);
        } catch {
            // Not this type, or the type rejects this locale — try the next.
        }
    }
    return null;
}

/**
 * Walk a raw tree, drop disabled nodes, resolve entry refs to URLs, and
 * map `_children` → `children`.
 */
async function walkNodes(
    nodes: RawNode[],
    ctx: PluginContext,
    locale: string | undefined
): Promise<MenuItem[]> {
    const result: MenuItem[] = [];
    for (const node of nodes) {
        if (node._disabled === true) continue;

        let url: string | undefined;

        if (typeof node.entry === 'string' && node.entry !== '') {
            const resolved = await resolveEntryRef(ctx, node.entry, locale);
            if (resolved !== null) {
                url = resolved;
            }
        } else if (typeof node.url === 'string' && node.url !== '') {
            url = node.url;
        }

        const item: MenuItem = { label: node.label ?? '' };
        if (url !== undefined) item.url = url;
        if (node.newTab === true) item.newTab = true;

        const childNodes = Array.isArray(node._children) ? node._children : [];
        if (childNodes.length > 0) {
            const resolvedChildren = await walkNodes(childNodes, ctx, locale);
            if (resolvedChildren.length > 0) {
                item.children = resolvedChildren;
            }
        }

        result.push(item);
    }
    return result;
}

/** The `get` service method, scoped to the plugin's configured menus. */
export function buildMenusService(
    configs: MenuConfig[]
): Record<string, AnyServiceMethod> {
    const configuredKeys = new Set(configs.map((c) => c.key));

    return {
        get: defineServiceMethod<
            { key: string; locale?: string | undefined },
            MenuItem[] | null
        >({
            access: 'public',
            summary: 'Resolve a configured menu into a nested tree of menu items.',
            input: z.object({ key: z.string(), locale: z.string().optional() }),
            mutates: false,
            handler: async (input, ctx): Promise<MenuItem[] | null> => {
                const key = typeof input?.key === 'string' ? input.key : null;
                if (!key) return null;
                if (!configuredKeys.has(key)) return null;

                const locale =
                    typeof input?.locale === 'string' ? input.locale : undefined;
                // Trusted internal read of the plugin's own menu global, at the
                // qualified key core resolves it under. Reads through
                // `ctx.globals` are full-shaped by default (plugin altitude is
                // trusted server code) — the handler returns a sanitised menu
                // tree, never the raw fields, so this never leaks.
                const global = await ctx.globals.get({
                    key: `${ctx.plugin.namespace}/menu-${key}`,
                    ...(locale ? { locale } : {}),
                });
                const stored = global?.fields['items'];
                const items = Array.isArray(stored) ? (stored as RawNode[]) : [];
                return walkNodes(items, ctx, locale);
            },
        }),
    };
}
