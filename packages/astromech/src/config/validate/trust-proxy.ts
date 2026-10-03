/**
 * The check `security.trustProxy` needs beyond its type.
 */

import type { TrustProxy } from '@/types/index';
import { AstromechError } from '@/errors/astromech-error';

/**
 * `security.trustProxy` is a boolean or a count of proxies. Any other value
 * reads no client address, which turns off every limit keyed on it without a
 * word, so it is refused at config resolution instead.
 */
export function assertTrustProxyValid(trustProxy: TrustProxy | undefined): void {
    if (trustProxy === undefined || typeof trustProxy === 'boolean') return;
    if (Number.isInteger(trustProxy) && trustProxy >= 0) return;
    throw new AstromechError(
        `\`security.trustProxy\` must be true, false or the number of proxies in ` +
            `front of the server as a whole number, not ${JSON.stringify(trustProxy)}.`
    );
}
