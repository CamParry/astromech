/**
 * The connecting address the HTTP transport puts on a plugin context: trusted
 * infrastructure sources only, and absent rather than spoofable.
 */

import type { ServerBindings } from '@/transport/http/client-address';
import type { TrustProxy } from '@/types/index';
import { expectConsole } from '@tests/console';
import { resetRuntime, resolveTestConfig } from '@tests/harness';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setConfig } from '@/config/registry';
import { getClientAddress } from '@/transport/http/client-address';

const PROXY_WARNING = 'set `security.trustProxy`';

/**
 * Serve `GET /` with the resolved address as the body, and call it with
 * `headers`, passing `remoteAddress` as the server would.
 */
async function addressFor(
    headers: Record<string, string>,
    remoteAddress?: string
): Promise<string> {
    const app = new Hono<{ Bindings: ServerBindings }>();
    app.get('/', (c) => c.text(getClientAddress(c) ?? 'absent'));
    const bindings: ServerBindings = remoteAddress === undefined ? {} : { remoteAddress };
    const response = await app.request('/', { headers }, bindings);
    return response.text();
}

/** Make `getRuntimeKey()` answer `workerd`, which reads the runtime's user agent. */
function pretendWorkers(): void {
    vi.stubGlobal('navigator', { userAgent: 'Cloudflare-Workers' });
}

/** Publish a config whose `security.trustProxy` is `value`. */
function trustProxy(value: TrustProxy): void {
    setConfig(resolveTestConfig({ security: { trustProxy: value } }));
}

describe('getClientAddress', () => {
    beforeEach(() => {
        resetRuntime();
        setConfig(resolveTestConfig());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('reads cf-connecting-ip on Workers', async () => {
        pretendWorkers();

        expect(await addressFor({ 'cf-connecting-ip': '203.0.113.4' })).toBe(
            '203.0.113.4'
        );
    });

    it('reads cf-connecting-ip on Workers without a trustProxy opt-in', async () => {
        pretendWorkers();
        trustProxy(false);

        expect(
            await addressFor({
                'cf-connecting-ip': '203.0.113.4',
                'x-forwarded-for': '198.51.100.9',
            })
        ).toBe('203.0.113.4');
    });

    it('ignores cf-connecting-ip off Workers', async () => {
        expect(await addressFor({ 'cf-connecting-ip': '203.0.113.4' })).toBe('absent');
    });

    it('ignores x-forwarded-for by default', async () => {
        expect(await addressFor({ 'x-forwarded-for': '203.0.113.4' })).toBe('absent');
    });

    it('ignores a spoofed x-forwarded-for when trustProxy is false', async () => {
        trustProxy(false);

        expect(await addressFor({ 'x-forwarded-for': '203.0.113.4, 10.0.0.1' })).toBe(
            'absent'
        );
    });

    it('takes the only entry a single proxy appends when trustProxy is true', async () => {
        trustProxy(true);

        expect(await addressFor({ 'x-forwarded-for': '1.2.3.4' })).toBe('1.2.3.4');
    });

    it('takes the last entry when trustProxy is true', async () => {
        trustProxy(true);

        expect(await addressFor({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' })).toBe(
            '10.0.0.1'
        );
    });

    it('takes the nth entry from the end for a chain of n proxies', async () => {
        trustProxy(2);

        expect(await addressFor({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' })).toBe(
            '1.2.3.4'
        );
    });

    it('counts a longer chain from the end too', async () => {
        trustProxy(3);

        expect(
            await addressFor({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1, 10.0.0.2' })
        ).toBe('1.2.3.4');
    });

    it('is absent when the header carries fewer entries than the hop count', async () => {
        trustProxy(3);

        expect(await addressFor({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' })).toBe(
            'absent'
        );
    });

    it('is absent when the hop count is below one', async () => {
        trustProxy(0);

        expect(await addressFor({ 'x-forwarded-for': '1.2.3.4' })).toBe('absent');
    });

    it('trims whitespace and ignores empty entries', async () => {
        trustProxy(2);

        expect(await addressFor({ 'x-forwarded-for': ' 1.2.3.4 ,, 10.0.0.1 ,' })).toBe(
            '1.2.3.4'
        );
    });

    it('is absent when trustProxy is set but the header is missing', async () => {
        trustProxy(true);

        expect(await addressFor({})).toBe('absent');
    });

    it('is absent when no source carries an address', async () => {
        expect(await addressFor({})).toBe('absent');
    });

    it('reads the remote address when no proxy is trusted', async () => {
        expect(await addressFor({}, '203.0.113.4')).toBe('203.0.113.4');
    });

    it('reads the remote address, not a forged x-forwarded-for', async () => {
        expectConsole('error', PROXY_WARNING);

        expect(
            await addressFor({ 'x-forwarded-for': '198.51.100.9' }, '203.0.113.4')
        ).toBe('203.0.113.4');
    });

    it.each(['x-forwarded-for', 'forwarded', 'cf-connecting-ip'])(
        'tells the site to set trustProxy when it counts the connection of a request carrying %s',
        async (header) => {
            const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

            await addressFor({ [header]: '198.51.100.9' }, '10.0.0.1');
            await addressFor({ [header]: '198.51.100.9' }, '10.0.0.1');

            expect(error).toHaveBeenCalledTimes(1);
            expect(error.mock.calls[0]?.[0]).toContain(PROXY_WARNING);
        }
    );

    it('says nothing of a proxy when a request carries no forwarding header', async () => {
        expect(await addressFor({}, '203.0.113.4')).toBe('203.0.113.4');
    });

    it('ignores the remote address when trustProxy names the proxy chain', async () => {
        trustProxy(1);

        expect(await addressFor({}, '10.0.0.1')).toBe('absent');
        expect(await addressFor({ 'x-forwarded-for': '203.0.113.4' }, '10.0.0.1')).toBe(
            '203.0.113.4'
        );
    });

    it('ignores the remote address on Workers', async () => {
        pretendWorkers();

        expect(await addressFor({}, '203.0.113.4')).toBe('absent');
    });

    it.each([
        ['1.2.3.4:5678', '1.2.3.4'],
        ['[::1]', '::1'],
        ['[2001:db8::1]:443', '2001:db8::1'],
        ['2001:db8::1', '2001:db8::1'],
    ])('reads %s from x-forwarded-for as %s', async (entry, address) => {
        trustProxy(true);

        expect(await addressFor({ 'x-forwarded-for': entry })).toBe(address);
    });

    it.each(['unknown', 'not an address', '1.2.3.4:http', '[::1', '[::1]x', '999.1.1.1'])(
        'drops %s, which is not an IP address',
        async (entry) => {
            trustProxy(true);
            expectConsole('error', 'is not an IP address');

            expect(await addressFor({ 'x-forwarded-for': entry })).toBe('absent');
        }
    );

    it('logs a dropped value once per process', async () => {
        trustProxy(true);
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        await addressFor({ 'x-forwarded-for': 'unknown' });
        await addressFor({ 'x-forwarded-for': 'garbage' });

        expect(error).toHaveBeenCalledTimes(1);
    });
});
