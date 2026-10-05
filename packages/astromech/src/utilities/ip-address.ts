/**
 * IP address helpers with no dependencies: the key a per-client limit counts
 * under, and address ranges for the block list. Safe for any layer to import.
 */

import { isIP } from 'node:net';

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
export function ipv6Groups(address: string): number[] {
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

/** An IPv4 or IPv6 network: `version`, the address as a bigint, and the prefix length. */
export type AddressRange = { version: 4 | 6; network: bigint; prefix: number };

/**
 * Parse `1.2.3.4`, `10.0.0.0/8`, `2001:db8::/32` or `::1`; undefined for anything
 * else. An IPv4-mapped IPv6 address is read as IPv4. Host bits are masked off.
 */
export function parseAddressRange(value: string): AddressRange | undefined {
    const parts = value.split('/');
    const [address = '', prefixText] = parts;
    if (parts.length > 2 || address.includes('%')) return undefined;

    const parsed = parseAddress(address);
    if (parsed === undefined) return undefined;

    let prefix: number = parsed.bits;
    if (prefixText !== undefined) {
        if (!/^\d+$/.test(prefixText)) return undefined;
        prefix = Number(prefixText);
        // A prefix written against a mapped address counts from the IPv6 form.
        if (parsed.mapped) prefix -= 96;
        if (prefix < 0 || prefix > parsed.bits) return undefined;
    }
    const hostBits = BigInt(parsed.bits - prefix);
    return {
        version: parsed.version,
        network: (parsed.value >> hostBits) << hostBits,
        prefix,
    };
}

/** Whether `address` (a plain IP) lies in `range`. Never across families. */
export function isAddressInRange(address: string, range: AddressRange): boolean {
    const parsed = parseAddress(address);
    if (parsed?.version !== range.version) return false;
    const hostBits = BigInt(parsed.bits - range.prefix);
    return parsed.value >> hostBits === range.network >> hostBits;
}

type ParsedAddress = { version: 4 | 6; bits: 32 | 128; value: bigint; mapped: boolean };

/** An IP address as a bigint, with an IPv4-mapped IPv6 address read as IPv4. */
function parseAddress(address: string): ParsedAddress | undefined {
    const version = isIP(address);
    if (version === 0 || address.includes('%')) return undefined;
    if (version === 4) {
        const value = address
            .split('.')
            .reduce((total, octet) => total * 256n + BigInt(octet), 0n);
        return { version: 4, bits: 32, value, mapped: false };
    }
    const groups = ipv6Groups(address);
    const mapped =
        groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
    if (mapped) {
        const [high = 0, low = 0] = groups.slice(6);
        return { version: 4, bits: 32, value: BigInt(high * 65536 + low), mapped: true };
    }
    const value = groups.reduce((total, group) => total * 65536n + BigInt(group), 0n);
    return { version: 6, bits: 128, value, mapped: false };
}
