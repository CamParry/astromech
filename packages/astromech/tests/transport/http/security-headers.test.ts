/** The headers the composed HTTP app sends on an API response, and when it sends HSTS. */

import type { AstromechConfig } from '@/types/index';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { createHttpApp } from '@/transport/http/app';

beforeEach(async () => {
    await createTestDb();
});

/** The headers of a public API response under `security`. */
async function headersWith(security: AstromechConfig['security'] = {}): Promise<Headers> {
    const app = createHttpApp(setupTestConfig({ ...makeTestConfig(), security }));
    const response = await app.request('/cms/api/setup/check');
    expect(response.status).toBe(200);
    return response.headers;
}

describe('Strict-Transport-Security', () => {
    it('is not sent by default', async () => {
        expect((await headersWith()).get('Strict-Transport-Security')).toBeNull();
    });

    it('is not sent when hsts is false', async () => {
        expect(
            (await headersWith({ hsts: false })).get('Strict-Transport-Security')
        ).toBeNull();
    });

    it.each([
        [true, 'max-age=31536000'],
        [{}, 'max-age=31536000'],
        [{ maxAge: 600, includeSubDomains: true }, 'max-age=600; includeSubDomains'],
        [{ maxAge: 0 }, 'max-age=0'],
        [
            { maxAge: 63072000, includeSubDomains: true, preload: true },
            'max-age=63072000; includeSubDomains; preload',
        ],
    ])('sends %j as %s', async (hsts, value) => {
        expect((await headersWith({ hsts })).get('Strict-Transport-Security')).toBe(
            value
        );
    });
});

describe('the other security headers', () => {
    it('keeps nosniff, X-Frame-Options and Referrer-Policy', async () => {
        const headers = await headersWith();

        expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
        expect(headers.get('X-Frame-Options')).toBe('DENY');
        expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    });
});
