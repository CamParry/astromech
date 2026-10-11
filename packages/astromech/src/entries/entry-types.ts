/**
 * Entry type ids. A site's type is addressed by its bare key (`post`), a
 * plugin's by `{plugin}/{type}`; both live in `ResolvedConfig.entryTypes`.
 */

import type { ResolvedConfig, ResolvedEntryType } from '@/types/index';

export const QUALIFIED_SEPARATOR = '/';

/**
 * Characters an entry type or a global key may not contain: both are id
 * separators.
 */
export const ID_SEPARATORS = /[/:]/;

/**
 * The one name an entry type, global key or role slug may not take. The
 * resolved maps are plain objects, and assigning `__proto__` sets the map's
 * prototype rather than adding a key; the admin config, emitted as an object
 * literal, would do the same.
 */
export const PROTOTYPE_KEY = '__proto__';

/** Build the id a plugin's entry type or global is addressed by: `{plugin}/{name}`. */
export function qualifyEntryType(plugin: string, type: string): string {
    return `${plugin}${QUALIFIED_SEPARATOR}${type}`;
}

/**
 * The entry type an id names, the site's or a plugin's, or undefined. An own
 * property only, so `constructor` names nothing.
 */
export function resolveEntryType(
    config: Pick<ResolvedConfig, 'entryTypes'>,
    typeId: string
): ResolvedEntryType | undefined {
    return Object.hasOwn(config.entryTypes, typeId)
        ? config.entryTypes[typeId]
        : undefined;
}
