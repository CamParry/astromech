/** Address grouping for rate limits, and address ranges for the block list. */

import { describe, expect, it } from 'vitest';
import {
    isAddressInRange,
    parseAddressRange,
    rateLimitKey,
} from '@/utilities/ip-address';

describe('rateLimitKey', () => {
    it.each([
        ['203.0.113.4', '203.0.113.4'],
        ['::ffff:203.0.113.4', '203.0.113.4'],
        ['::FFFF:cb00:7104', '203.0.113.4'],
        ['0:0:0:0:0:ffff:203.0.113.4', '203.0.113.4'],
        ['2001:db8:1:2::1', '2001:db8:1:2::/64'],
        ['2001:0DB8:0001:0002:ffff:ffff:ffff:ffff', '2001:db8:1:2::/64'],
        ['2001:db8::1', '2001:db8:0:0::/64'],
        ['fe80::1%eth0', 'fe80:0:0:0::/64'],
        ['::1', '0:0:0:0::/64'],
        ['::', '0:0:0:0::/64'],
        ['not an address', 'not an address'],
    ])('keys %s as %s', (address, key) => {
        expect(rateLimitKey(address)).toBe(key);
    });
});

describe('isAddressInRange', () => {
    it.each([
        ['10.0.0.0/24', '10.0.0.200', true],
        ['10.0.0.0/24', '10.0.1.1', false],
        ['10.1.2.3', '10.1.2.3', true],
        ['10.1.2.3', '10.1.2.4', false],
        ['10.1.2.3/8', '10.9.9.9', true],
        ['2001:db8::/32', '2001:db8:ffff::1', true],
        ['2001:db8::/32', '2001:db9::1', false],
        ['2001:db8:1:2::/64', '2001:db8:1:2:aaaa::1', true],
        ['::1', '::1', true],
        ['::ffff:10.0.0.1', '10.0.0.1', true],
        ['10.0.0.0/8', '::ffff:10.0.0.1', true],
        ['0.0.0.0/0', '203.0.113.9', true],
        ['0.0.0.0/0', '2001:db8::1', false],
        ['::/0', '2001:db8::1', true],
        ['::/0', '203.0.113.9', false],
        ['10.0.0.0/8', '2001:db8::1', false],
        ['2001:db8::/32', '10.0.0.1', false],
    ])('range %s holds %s: %s', (range, address, expected) => {
        const parsed = parseAddressRange(range);

        expect(parsed).toBeDefined();
        expect(parsed && isAddressInRange(address, parsed)).toBe(expected);
    });
});

describe('parseAddressRange', () => {
    it.each([
        '1.2.3.4/33',
        '::/129',
        '10.0.0.0/8.5',
        '10.0.0.0/-1',
        '10.0.0.0/',
        '10.0.0.0/8/8',
        'fe80::1%eth0',
        'example.com',
        '',
        '1.2.3',
        '::ffff:10.0.0.0/64',
    ])('refuses %j', (value) => {
        expect(parseAddressRange(value)).toBeUndefined();
    });

    it('masks the host bits off the network', () => {
        expect(parseAddressRange('10.1.2.3/8')).toEqual(parseAddressRange('10.0.0.0/8'));
    });
});
