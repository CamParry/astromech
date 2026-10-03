/**
 * `getClientAddress` over generated `x-forwarded-for` values: an IP address
 * written with a port or in brackets reads back as the bare address.
 */

import type { ServerBindings } from '@/transport/http/client-address';
import { resetRuntime, resolveTestConfig } from '@tests/harness';
import fc from 'fast-check';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
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
    });

    it('reads an address written with a port or in brackets as the bare address', async () => {
        await fc.assert(
            fc.asyncProperty(writtenAddress, async ({ address, written }) => {
                expect(await addressFor(written)).toBe(address);
            })
        );
    });
});
