/**
 * The connecting address of an HTTP request — the client identity abuse
 * controls key on. Only sources set by infrastructure are read, so a caller
 * cannot mint a new identity per request; when none is available the address is
 * absent and the caller goes unmetered.
 */

import type { Context } from 'hono';
import { getRuntimeKey } from 'hono/adapter';
import type { TrustProxy } from '@/types/index';
import { Astromech } from '@/transport/local/index';

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

    const trustProxy: TrustProxy = Astromech.config.security?.trustProxy ?? false;
    if (trustProxy === false) return undefined;

    return forwardedAddress(
        c.req.header('x-forwarded-for'),
        trustProxy === true ? 1 : trustProxy
    );
}

/**
 * Take the entry `hops` places in from the right of `x-forwarded-for` — those
 * rightmost entries are the trusted proxies, while the leftmost is whatever the
 * client sent. Undefined when the header carries fewer entries than that: a
 * misconfigured hop count must fail closed, not fall back to a forgeable entry.
 */
function forwardedAddress(header: string | undefined, hops: number): string | undefined {
    if (header === undefined || hops < 1) return undefined;

    const entries = header
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry !== '');

    return entries[entries.length - 1 - hops];
}
