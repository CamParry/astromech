/**
 * The connecting address the HTTP transport puts on a plugin context: trusted
 * infrastructure sources only, and absent rather than spoofable.
 */

import type { ResolvedConfig, TrustProxy } from '@/types/index';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setConfig } from '@/config/registry';
import { getClientAddress } from '@/transport/http/client-address';

/** Serve `GET /` with the resolved address as the body, and call it with `headers`. */
async function addressFor(headers: Record<string, string>): Promise<string> {
    const app = new Hono();
    app.get('/', (c) => c.text(getClientAddress(c) ?? 'absent'));
    const response = await app.request('/', { headers });
    return response.text();
}

/** Make `getRuntimeKey()` answer `workerd`, which reads the runtime's user agent. */
function pretendWorkers(): void {
    vi.stubGlobal('navigator', { userAgent: 'Cloudflare-Workers' });
}

/** Publish a config carrying only `security.trustProxy`. */
function trustProxy(value: TrustProxy): void {
    setConfig({ security: { trustProxy: value } } as unknown as ResolvedConfig);
}

describe('getClientAddress', () => {
    beforeEach(() => {
        setConfig({} as unknown as ResolvedConfig);
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
});
