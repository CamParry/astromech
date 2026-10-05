/** The `Strict-Transport-Security` value that `security.hsts` asks for. */

import type { HstsConfig } from '@/types/index';
import { HSTS_DEFAULT_MAX_AGE } from '@/config/validate/hsts';

/** The `Strict-Transport-Security` value `security.hsts` asks for, or undefined when off. */
export function strictTransportSecurity(
    hsts: boolean | HstsConfig | undefined
): string | undefined {
    if (hsts === undefined || hsts === false) return undefined;
    const options = hsts === true ? {} : hsts;
    return [
        `max-age=${options.maxAge ?? HSTS_DEFAULT_MAX_AGE}`,
        ...(options.includeSubDomains === true ? ['includeSubDomains'] : []),
        ...(options.preload === true ? ['preload'] : []),
    ].join('; ');
}
