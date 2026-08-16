/**
 * The connecting address of an HTTP request — the client identity abuse
 * controls key on. Only sources set by infrastructure are read, so a caller
 * cannot mint a new identity per request; when none is available the address is
 * absent and the caller goes unmetered.
 */

import type { Context } from 'hono';
import { getRuntimeKey } from 'hono/adapter';

/**
 * Read the connecting address, or undefined when the runtime exposes none.
 *
 * `x-forwarded-for` is not read: a Node server exposed directly lets any client
 * send it, so keying on it would let one caller forge an identity per request.
 * A deployment behind a trusted proxy needs an explicit opt-in, and that opt-in
 * is the extension point here — as is Hono's per-runtime `getConnInfo`, which
 * reports the socket address once a host mounts the app with its server env
 * (Astromech's Astro entrypoint calls `app.fetch(request)` with none).
 */
export function getClientAddress(c: Context): string | undefined {
    // Cloudflare overwrites `cf-connecting-ip` on every request it proxies, so
    // the header is trustworthy — but only on the runtime Cloudflare serves.
    // A Node deployment behind Cloudflare takes the trusted-proxy opt-in above.
    if (getRuntimeKey() === 'workerd') {
        const connectingIp = c.req.header('cf-connecting-ip');
        if (connectingIp !== undefined && connectingIp !== '') return connectingIp;
    }

    return undefined;
}
