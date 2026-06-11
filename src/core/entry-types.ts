/**
 * Entry type identity helpers.
 *
 * Root (user) entry types use bare ids (`post`). Plugin-contributed entry types
 * are namespaced as `{plugin}/{type}` and live in `ResolvedConfig.pluginEntries`
 * rather than flat-merging into root `entries`. These helpers parse, qualify,
 * and resolve a type id against the right map.
 */

import type { ResolvedConfig, ResolvedEntryTypeConfig } from '@/types/index.js';

export const QUALIFIED_SEPARATOR = '/';

/**
 * Parse an entry type id. Returns `null` for bare (root) ids. A qualified id
 * splits on the FIRST separator only — the type segment may itself contain `/`.
 */
export function parseEntryTypeId(id: string): { plugin: string; type: string } | null {
    const index = id.indexOf(QUALIFIED_SEPARATOR);
    if (index === -1) return null;
    return { plugin: id.slice(0, index), type: id.slice(index + 1) };
}

/** Build the qualified id for a plugin entry type: `{plugin}/{type}`. */
export function qualifyEntryType(plugin: string, type: string): string {
    return `${plugin}${QUALIFIED_SEPARATOR}${type}`;
}

/**
 * Resolve a type id against root entries (bare id) or pluginEntries (qualified).
 * Bare ids behave exactly like `config.entries[id]`. Returns undefined when the
 * plugin or type is unknown.
 */
export function resolveEntryType(
    config: Pick<ResolvedConfig, 'entries' | 'pluginEntries'>,
    typeId: string
): ResolvedEntryTypeConfig | undefined {
    const parsed = parseEntryTypeId(typeId);
    if (!parsed) return config.entries[typeId];
    return config.pluginEntries[parsed.plugin]?.[parsed.type];
}
