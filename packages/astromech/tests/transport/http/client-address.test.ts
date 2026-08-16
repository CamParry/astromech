/**
 * The connecting address the HTTP transport puts on a plugin context: trusted
 * infrastructure sources only, and absent rather than spoofable.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
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

describe('getClientAddress', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('reads cf-connecting-ip on Workers', async () => {
        pretendWorkers();

        expect(await addressFor({ 'cf-connecting-ip': '203.0.113.4' })).toBe(
            '203.0.113.4'
        );
    });

    it('ignores cf-connecting-ip off Workers', async () => {
        expect(await addressFor({ 'cf-connecting-ip': '203.0.113.4' })).toBe('absent');
    });

    it('never reads x-forwarded-for', async () => {
        pretendWorkers();

        expect(await addressFor({ 'x-forwarded-for': '203.0.113.4' })).toBe('absent');
    });

    it('is absent when no source carries an address', async () => {
        expect(await addressFor({})).toBe('absent');
    });
});
