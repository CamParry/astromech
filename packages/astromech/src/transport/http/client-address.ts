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
    // Trustworthy only on the runtime Cloudflare serves. A Node deployment
    // behind Cloudflare takes the `trustProxy` route below instead.
    const workerd = getRuntimeKey() === 'workerd';
    if (workerd) {
        const connectingIp = c.req.header('cf-connecting-ip');
        if (connectingIp !== undefined && connectingIp !== '') return connectingIp;
    }

    const trustProxy: TrustProxy = getConfig().security?.trustProxy ?? false;
    if (trustProxy === false) {
        // `app.request` in a test passes no bindings at all.
        const bindings: ServerBindings | undefined = c.env;
        const remoteAddress = bindings?.remoteAddress;
        if (workerd || remoteAddress === undefined) return undefined;
        warnOnForwardedHeader(c.req.raw.headers);
        return parseAddress(remoteAddress);
    }

    return forwardedAddress(
        c.req.header('x-forwarded-for'),
        trustProxy === true ? 1 : trustProxy
    );
}

/**
 * The key a per-client rate limit counts `address` under, grouped as Better
 * Auth groups sign-in attempts: an IPv6 address by its /64 network
 * (`2001:db8:1:2::/64`), since one client is often given a whole /64, and an
 * IPv4-mapped IPv6 address (`::ffff:1.2.3.4`) as its IPv4 address. A value that
 * is not an IP address is returned unchanged.
 */
export function rateLimitKey(address: string): string {
    if (isIP(address) !== 6) return address;

    const groups = ipv6Groups(address);
    const mapped =
        groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
    if (mapped) {
        const [high = 0, low = 0] = groups.slice(6);
        return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
    }
    return `${groups
        .slice(0, 4)
        .map((group) => group.toString(16))
        .join(':')}::/64`;
}

/** The eight 16-bit groups of an IPv6 address that `isIP` accepts. */
function ipv6Groups(address: string): number[] {
    const [withoutZone = ''] = address.split('%');
    // A trailing dotted IPv4 part (`::ffff:1.2.3.4`) fills the last two groups.
    const dotted = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(withoutZone);
    const hex = dotted
        ? withoutZone.slice(0, dotted.index) +
          [0, 2]
              .map((at) =>
                  (Number(dotted[at + 1]) * 256 + Number(dotted[at + 2])).toString(16)
              )
              .join(':')
        : withoutZone;

    const [head = '', tail] = hex.split('::');
    const parse = (part: string): number[] =>
        part === '' ? [] : part.split(':').map((group) => Number.parseInt(group, 16));
    const left = parse(head);
    const right = tail === undefined ? [] : parse(tail);
    const zeros = new Array<number>(8 - left.length - right.length).fill(0);
    return [...left, ...zeros, ...right];
}

/**
 * Log, once per process, that a request carrying a forwarding header was
 * counted by its connection: behind a proxy that is the proxy's address, so
 * every client would share one count.
 */
function warnOnForwardedHeader(headers: Headers): void {
    const forwarded = FORWARDING_HEADERS.find((name) => headers.has(name));
    if (forwarded === undefined) return;

    const state = globals();
    if (state.forwardedHeaderLogged === true) return;
    state.forwardedHeaderLogged = true;
    log.warn(
        `A request carried \`${forwarded}\`, but \`security.trustProxy\` is not set, so Astromech counts the address of the connection. Behind a proxy that is the proxy's address, and every client shares one count. If a proxy serves this site, set \`security.trustProxy\` in \`astromech.config.ts\` to the number of proxies in front of the server. This is logged once.`
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
