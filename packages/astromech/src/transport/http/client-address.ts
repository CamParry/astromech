/**
 * The connecting address of an HTTP request — the client identity abuse
 * controls key on. Only sources set by infrastructure are read, so a caller
 * cannot mint a new identity per request; when none is available the address is
 * absent and the caller goes unmetered.
 */

import type { Context } from 'hono';
import { getRuntimeKey } from 'hono/adapter';
import type { TrustProxy } from '@/types/index';
import { getConfig } from '@/config/registry';

/**
 * Read the connecting address, or undefined when no trusted source carries one.
 *
 * `cf-connecting-ip` needs no opt-in — Cloudflare overwrites it on every request
 * it proxies. `x-forwarded-for` is read only when the site sets
 * `security.trustProxy`, since a directly exposed server lets any client send it.
 */
export function getClientAddress(c: Context): string | undefined {
    // Trustworthy only on the runtime Cloudflare serves. A Node deployment
    // behind Cloudflare takes the `trustProxy` route below instead.
    if (getRuntimeKey() === 'workerd') {
        const connectingIp = c.req.header('cf-connecting-ip');
        if (connectingIp !== undefined && connectingIp !== '') return connectingIp;
    }

    const trustProxy: TrustProxy = getConfig().security?.trustProxy ?? false;
    if (trustProxy === false) return undefined;

    return forwardedAddress(
        c.req.header('x-forwarded-for'),
        trustProxy === true ? 1 : trustProxy
    );
}

/**
 * Take the client address from `x-forwarded-for` given `hops` trusted proxies.
 * Each proxy appends the peer it received the request from, so the last `hops`
 * entries come from infrastructure and the client's own is at `length - hops`.
 * Out of range fails closed: never fall back to a forgeable entry.
 */
function forwardedAddress(header: string | undefined, hops: number): string | undefined {
    if (header === undefined || hops < 1) return undefined;

    const entries = header
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry !== '');

    const index = entries.length - hops;
    if (index < 0) return undefined;

    return entries[index];
}
