/** `isAddressInRange` against an independent bit-string comparison. */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ipv6Groups, isAddressInRange, parseAddressRange } from '@/utilities/ip-address';

const octet = fc.integer({ min: 0, max: 255 });
const ipv4 = fc.tuple(octet, octet, octet, octet).map((parts) => parts.join('.'));
const ipv6 = fc
    .array(fc.integer({ min: 0, max: 0xffff }), { minLength: 8, maxLength: 8 })
    // Out of the IPv4-mapped block, which is read as IPv4.
    .filter(
        (groups) => !(groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff)
    )
    .map((groups) => groups.map((group) => group.toString(16)).join(':'));

/** The address as a string of bits, built without the code under test. */
function bitsOf(address: string): string {
    if (address.includes('.')) {
        return address
            .split('.')
            .map((part) => Number(part).toString(2).padStart(8, '0'))
            .join('');
    }
    return ipv6Groups(address)
        .map((group) => group.toString(2).padStart(16, '0'))
        .join('');
}

describe('isAddressInRange', () => {
    it.each([
        ['IPv4', ipv4, 32],
        ['IPv6', ipv6, 128],
    ] as const)(
        'holds every %s address in its own host range',
        (_family, arbitrary, bits) => {
            fc.assert(
                fc.property(arbitrary, (address) => {
                    const range = parseAddressRange(`${address}/${bits}`);
                    expect(range && isAddressInRange(address, range)).toBe(true);
                })
            );
        }
    );

    it.each([
        ['IPv4', ipv4, 32],
        ['IPv6', ipv6, 128],
    ] as const)(
        'agrees with a prefix comparison of the bits for %s',
        (_family, arbitrary, bits) => {
            fc.assert(
                fc.property(
                    arbitrary,
                    arbitrary,
                    fc.integer({ min: 0, max: bits }),
                    (network, address, prefix) => {
                        const range = parseAddressRange(`${network}/${prefix}`);
                        const expected =
                            bitsOf(network).slice(0, prefix) ===
                            bitsOf(address).slice(0, prefix);

                        expect(range && isAddressInRange(address, range)).toBe(expected);
                    }
                )
            );
        }
    );
});
