/** Resolving a global's id to its declaration, the site's or a plugin's. */

import type { ResolvedConfig, ResolvedGlobal } from '@/types/index';
import { ResourceNotFoundError } from '@/errors/resource';

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

/** {@link resolveGlobal}, throwing for a key nothing declares. */
export function getDeclaredGlobal(config: ResolvedConfig, key: string): ResolvedGlobal {
    const global = resolveGlobal(config, key);
    if (!global) throw new ResourceNotFoundError('global', { id: key });
    return global;
}
