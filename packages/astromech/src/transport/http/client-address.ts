/**
 * The connecting address of an HTTP request — the client identity abuse
 * controls key on. Only sources set by infrastructure are read, so a caller
 * cannot mint a new identity per request.
 */

import type { TrustProxy } from '@/types/index';
import type { Context } from 'hono';
import { isIP } from 'node:net';
import { getRuntimeKey } from 'hono/adapter';
import { getConfig } from '@/config/registry';
import { globals } from '@/registry';
import { log } from '@/utilities/log';

/**
 * The Hono bindings `Astromech.fetch` passes: `remoteAddress` is the address of
 * the connection's peer, when the serving integration knows it.
 */
export type ServerBindings = { remoteAddress?: string | undefined };

/**
 * Read the connecting address, or undefined when no trusted source carries one:
 * `cf-connecting-ip` on Workers, `x-forwarded-for` only under
 * `security.trustProxy`, and otherwise the connection's remote address on Node.
 */
export function getClientAddress<E extends { Bindings: ServerBindings }>(
    c: Context<E>
): string | undefined {
    // `app.request` in a test passes no bindings at all.
    const bindings: ServerBindings | undefined = c.env;
    return resolveClientAddress(c.req.raw, bindings?.remoteAddress);
}

/** The connecting address of `request`, given the peer address the server saw. */
export function resolveClientAddress(
    request: Request,
    remoteAddress: string | undefined
): string | undefined {
    // Trustworthy only on the runtime Cloudflare serves. A Node deployment
    // behind Cloudflare takes the `trustProxy` route below instead.
    const workerd = getRuntimeKey() === 'workerd';
    if (workerd) {
        const connectingIp = request.headers.get('cf-connecting-ip');
        if (connectingIp !== null && connectingIp !== '') return connectingIp;
    }

    const trustProxy: TrustProxy = getConfig().security?.trustProxy ?? false;
    if (trustProxy === false) {
        if (workerd) return undefined;
        warnOnForwardedHeader(request.headers);
        if (remoteAddress === undefined) return undefined;
        return parseAddress(remoteAddress);
    }

    return forwardedAddress(
        request.headers.get('x-forwarded-for') ?? undefined,
        trustProxy === true ? 1 : trustProxy
    );
}

/**
 * Log, once per process, that a request carried a forwarding header which
 * Astromech does not read: behind a proxy, every client shares one count,
 * keyed on the proxy's address or on no address.
 */
function warnOnForwardedHeader(headers: Headers): void {
    const forwarded = FORWARDING_HEADERS.find((name) => headers.has(name));
    if (forwarded === undefined) return;

    const state = globals();
    if (state.forwardedHeaderLogged === true) return;
    state.forwardedHeaderLogged = true;
    log.warn(
        `A request carried \`${forwarded}\`, but \`security.trustProxy\` is not set, so Astromech does not read the client's address from it. Behind a proxy, every client then shares one count. If a proxy serves this site, set \`security.trustProxy\` in \`astromech.config.ts\` to the number of proxies in front of the server. This is logged once.`
    );
}

/** Headers a proxy or CDN sets, which a request straight from a client lacks. */
const FORWARDING_HEADERS = ['x-forwarded-for', 'forwarded', 'cf-connecting-ip'];

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
    const entry = entries[index];
    if (entry === undefined) return undefined;

    return parseAddress(entry);
}

/**
 * The IP address in `value`, without a port (`1.2.3.4:80`) or IPv6 brackets
 * (`[::1]`, `[::1]:443`), or undefined when it holds none. A value that is
 * dropped is logged, once per process.
 */
function parseAddress(value: string): string | undefined {
    const address = stripPort(value);
    if (address !== undefined && isIP(address) !== 0) return address;

    const state = globals();
    if (state.clientAddressDropLogged !== true) {
        state.clientAddressDropLogged = true;
        log.warn(
            `Ignored the client address ${JSON.stringify(value)}, which is not an IP address. Check that \`security.trustProxy\` matches the proxies in front of the server. Further values are dropped without a message.`
        );
    }
    return undefined;
}

/** `value` without a `:port` suffix or IPv6 brackets, or undefined when malformed. */
function stripPort(value: string): string | undefined {
    if (value.startsWith('[')) {
        const close = value.indexOf(']');
        if (close === -1) return undefined;
        const rest = value.slice(close + 1);
        if (rest !== '' && !/^:\d+$/.test(rest)) return undefined;
        return value.slice(1, close);
    }
    // One colon is IPv4 with a port; more is a bare IPv6 address.
    const colon = value.indexOf(':');
    if (colon !== -1 && colon === value.lastIndexOf(':')) {
        return /^\d+$/.test(value.slice(colon + 1)) ? value.slice(0, colon) : undefined;
    }
    return value;
}
