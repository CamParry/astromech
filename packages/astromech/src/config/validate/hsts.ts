/**
 * The checks `security.hsts` needs beyond its type.
 */

import type { HstsConfig } from '@/types/index';
import { AstromechError } from '@/errors/astromech-error';

/** One year in seconds, the `max-age` `hsts: true` sends. */
export const HSTS_DEFAULT_MAX_AGE = 31_536_000;

/** The shortest `max-age` the browsers' preload lists accept. */
const HSTS_PRELOAD_MAX_AGE = 31_536_000;

/**
 * `security.hsts` is a boolean or an object, `maxAge` a whole number of seconds
 * of zero or more, and `preload` needs `includeSubDomains` and a year, or the
 * browsers' preload lists refuse the host. A value that would send a header
 * the browser ignores fails at config resolution instead.
 */
export function assertHstsValid(hsts: boolean | HstsConfig | undefined): void {
    if (hsts === undefined || typeof hsts === 'boolean') return;
    if (typeof hsts !== 'object' || hsts === null) {
        throw new AstromechError(
            `\`security.hsts\` must be true, false or an object, not ${JSON.stringify(hsts)}.`
        );
    }
    const { maxAge, includeSubDomains, preload } = hsts;
    if (maxAge !== undefined && !(Number.isInteger(maxAge) && maxAge >= 0)) {
        throw new AstromechError(
            `\`security.hsts.maxAge\` must be a whole number of seconds, not ${JSON.stringify(maxAge)}.`
        );
    }
    if (preload !== true) return;
    if (includeSubDomains !== true) {
        throw new AstromechError(
            '`security.hsts.preload` needs `includeSubDomains: true`.'
        );
    }
    if ((maxAge ?? HSTS_DEFAULT_MAX_AGE) < HSTS_PRELOAD_MAX_AGE) {
        throw new AstromechError(
            `\`security.hsts.preload\` needs a \`maxAge\` of at least ${HSTS_PRELOAD_MAX_AGE}.`
        );
    }
}
