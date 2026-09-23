/**
 * Entry type ids. A site's type is addressed by its bare key (`post`), a
 * plugin's by `{plugin}/{type}`; both live in `ResolvedConfig.entryTypes`.
 */

import type { ResolvedConfig, ResolvedEntryType } from '@/types/index';

export const QUALIFIED_SEPARATOR = '/';

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
