/**
 * SDK method for @astromech/menus. Reads a menu blob from settings, drops
 * disabled nodes, resolves entry refs to front-end URLs via the entry type's
 * `url` template, and returns a clean tree.
 */

import type { AnyPluginSdkMethod, Entry, PluginContext } from '@/types/index.js';
import { defineSdkMethod } from '@/index.js';
import { resolveEntryUrl } from '@/support/entry-url.js';
import { menuBlobKey } from '../manifest.js';
import type { MenuConfig, MenuItem } from '../types.js';

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
    // Query all entry types to find the one holding this id.
    // We query all types because the relationship field stores only the id.
    for (const [type, config] of Object.entries(ctx.config.entries)) {
        if (!config.url) continue;
        try {
            const { data } = await ctx.sdk.entries.query({
                type,
                limit: 'all',
                ...(locale ? { locale } : {}),
            });
            const entry = (data as Entry[]).find((e) => e.id === entryId);
            if (entry && config.url) {
                return resolveEntryUrl(config.url, entry);
            }
        } catch {
            // Type may not support locale — skip
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

export function buildMenusSdk(configs: MenuConfig[]): Record<string, AnyPluginSdkMethod> {
    const configuredKeys = new Set(configs.map((c) => c.key));

    return {
        get: defineSdkMethod<{ key: string; locale?: string }, MenuItem[] | null>({
            access: 'public',
            handler: async (input, ctx): Promise<MenuItem[] | null> => {
                const key = typeof input?.key === 'string' ? input.key : null;
                if (!key) return null;
                if (!configuredKeys.has(key)) return null;

                const locale =
                    typeof input?.locale === 'string' ? input.locale : undefined;
                const blobKey = menuBlobKey(key);

                // Trusted internal read of the plugin's own menu blob: request the
                // full shape (settings default to public-only) — the handler returns a
                // sanitised menu tree, never the raw settings, so this never leaks.
                const blob = await ctx.sdk.settings.get(blobKey, {
                    full: true,
                    ...(locale ? { locale } : {}),
                });
                if (blob === null || typeof blob !== 'object' || Array.isArray(blob)) {
                    return [];
                }

                const raw = blob as Record<string, unknown>;
                const items = Array.isArray(raw['items'])
                    ? (raw['items'] as RawNode[])
                    : [];
                return walkNodes(items, ctx, locale);
            },
        }),
    };
}
