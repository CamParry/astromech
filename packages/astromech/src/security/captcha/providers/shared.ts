/**
 * What every provider's check takes, and the two steps they share: the request
 * parameters and the hostname comparison.
 */

import type { SiteverifyBody } from '../siteverify';
import type { CaptchaVerdict } from '../types';

/** One provider check. `hostnames` empty means any hostname passes. */
export type ProviderInput = {
    secret: string;
    siteKey: string;
    action: string;
    hostnames: string[];
    clientAddress?: string | undefined;
    minScore?: number | undefined;
};

/** The form body every siteverify call sends; `remoteip` only when the address is known. */
export function siteverifyParams(
    token: string,
    input: Pick<ProviderInput, 'secret' | 'clientAddress'>
): Record<string, string> {
    const params: Record<string, string> = { secret: input.secret, response: token };
    if (input.clientAddress !== undefined) params['remoteip'] = input.clientAddress;
    return params;
}

/** A failure when the token came from a hostname outside `hostnames`, or named none. */
export function checkHostname(body: SiteverifyBody, hostnames: string[]): CaptchaVerdict {
    if (hostnames.length === 0) return { ok: true };
    const hostname = typeof body.hostname === 'string' ? body.hostname.toLowerCase() : '';
    if (hostname === '') return { ok: false, reason: 'Verification named no hostname' };
    if (!hostnames.some((allowed) => allowed.toLowerCase() === hostname)) {
        return { ok: false, reason: `Hostname ${hostname} is not allowed` };
    }
    return { ok: true };
}
