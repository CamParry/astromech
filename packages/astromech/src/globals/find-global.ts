/** Resolving a global's key to its declaration, host or plugin. */

import type { ResolvedConfig, ResolvedGlobal } from '@/types/index';
import { QUALIFIED_SEPARATOR } from '@/entries/entry-types';

/**
 * The declaration for a key, or undefined when nothing declares it. A bare key
 * is a host global; a key holding the qualified separator is `<namespace>/<key>`
 * and resolves against that plugin's map alone, which is what stops a host
 * `settings` and a plugin's `seo/settings` reaching one another.
 */
export function findGlobal(
    config: ResolvedConfig,
    key: string
): ResolvedGlobal | undefined {
    const index = key.indexOf(QUALIFIED_SEPARATOR);
    if (index === -1) return config.globals[key];
    return config.pluginGlobals[key.slice(0, index)]?.[key.slice(index + 1)];
}
