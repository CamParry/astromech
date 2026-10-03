/**
 * `getClientAddress` over generated `x-forwarded-for` values: an IP address
 * written with a port or in brackets reads back as the bare address, and any
 * value at all reads as an IP address or as none.
 */

import type { ServerBindings } from '@/transport/http/client-address';
import { isIP } from 'node:net';
import { resetRuntime, resolveTestConfig } from '@tests/harness';
import fc from 'fast-check';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setConfig } from '@/config/registry';
import { getClientAddress } from '@/transport/http/client-address';

/** The address read from `x-forwarded-for` behind one trusted proxy. */
async function addressFor(forwardedFor: string): Promise<string | undefined> {
    const app = new Hono<{ Bindings: ServerBindings }>();
    app.get('/', (c) => c.json({ address: getClientAddress(c) ?? null }));
    const response = await app.request('/', {
        headers: { 'x-forwarded-for': forwardedFor },
    });
    const { address } = (await response.json()) as { address: string | null };
    return address ?? undefined;
}

/** An IP address, and the ways a proxy may write it in a header. */
const writtenAddress = fc
    .tuple(
        fc.oneof(fc.ipV4(), fc.ipV6()),
        fc.option(fc.integer({ min: 1, max: 65535 }), { nil: undefined }),
        fc.boolean()
    )
    .map(([address, port, bracketed]) => {
        const v6 = address.includes(':');
        const host = v6 && (bracketed || port !== undefined) ? `[${address}]` : address;
        return { address, written: port === undefined ? host : `${host}:${port}` };
    });

describe('getClientAddress over generated x-forwarded-for values', () => {
    beforeEach(() => {
        resetRuntime();
        setConfig(resolveTestConfig({ security: { trustProxy: true } }));
        // A dropped value is logged; what is logged is checked in the example tests.
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    it('reads an address written with a port or in brackets as the bare address', async () => {
        await fc.assert(
            fc.asyncProperty(writtenAddress, async ({ address, written }) => {
                expect(await addressFor(written)).toBe(address);
            })
        );
    });

    it('reads any value as an IP address or as none', async () => {
        await fc.assert(
            fc.asyncProperty(fc.string(), async (value) => {
                const address = await addressFor(value);
                expect(address === undefined || isIP(address) !== 0).toBe(true);
            })
        );
    });
});
