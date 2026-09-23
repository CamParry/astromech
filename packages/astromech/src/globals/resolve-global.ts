/** Resolving a global's id to its declaration, the site's or a plugin's. */

import type { ResolvedConfig, ResolvedGlobal } from '@/types/index';

/**
 * The declaration for an id, or undefined when nothing declares it. A site
 * global's id is its key, a plugin's is `<namespace>/<key>`. An own property
 * only, so `constructor` names nothing.
 */
export function resolveGlobal(
    config: Pick<ResolvedConfig, 'globals'>,
    key: string
): ResolvedGlobal | undefined {
    return Object.hasOwn(config.globals, key) ? config.globals[key] : undefined;
}
