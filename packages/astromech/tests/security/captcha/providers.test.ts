/**
 * The captcha check against each provider's `siteverify` endpoint. `fetch` is
 * stubbed because the request leaves the process; everything else is real.
 */

import type { CaptchaConfig } from '@/security/captcha/types';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearEnvSource, setEnvSource } from '@/env';
import { verifyCaptcha } from '@/security/captcha/verify';

const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const RECAPTCHA_URL = 'https://www.google.com/recaptcha/api/siteverify';
const HCAPTCHA_URL = 'https://api.hcaptcha.com/siteverify';

/** The URL and form body of each siteverify request. */
let requests: { url: string; body: URLSearchParams }[];

beforeEach(async () => {
    await createTestDb();
    requests = [];
    setEnvSource({ ASTROMECH_CAPTCHA_SECRET: 'super-secret' });
});

afterEach(() => {
    vi.unstubAllGlobals();
    clearEnvSource();
});

function configure(captcha: CaptchaConfig): void {
    setupTestConfig({ ...makeTestConfig(), security: { captcha } });
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

/** Answer every siteverify request with `respond`, recording it. */
function stubFetch(respond: () => Response | Promise<Response>): void {
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
        requests.push({ url, body: new URLSearchParams(String(init.body)) });
        return respond();
    });
}

function turnstile(extra: Partial<CaptchaConfig> = {}): void {
    configure({ provider: 'turnstile', siteKey: 'site-key', ...extra });
}

describe('every provider', () => {
    it('short-circuits on a missing token without a request', async () => {
        turnstile();
        stubFetch(() => jsonResponse({ success: true }));

        const verdict = await verifyCaptcha({ token: undefined, action: 'sign_in' });

        expect(verdict).toEqual({ ok: false, reason: 'Missing verification token' });
        expect(requests).toEqual([]);
    });

    it('short-circuits on a blank token without a request', async () => {
        turnstile();
        stubFetch(() => jsonResponse({ success: true }));

        const verdict = await verifyCaptcha({ token: '   ', action: 'sign_in' });

        expect(verdict.ok).toBe(false);
        expect(requests).toEqual([]);
    });

    it('fails closed on a non-200 response', async () => {
        turnstile();
        stubFetch(() => jsonResponse({ success: true }, 500));

        const verdict = await verifyCaptcha({ token: 'a-token', action: 'sign_in' });

        expect(verdict).toEqual({
            ok: false,
            reason: 'Verification request failed (500)',
        });
    });

    it('fails closed on a malformed JSON body', async () => {
        turnstile();
        stubFetch(() => new Response('not json', { status: 200 }));

        const verdict = await verifyCaptcha({ token: 'a-token', action: 'sign_in' });

        expect(verdict.ok).toBe(false);
    });

    it('fails closed when fetch itself throws', async () => {
        turnstile();
        stubFetch(() => Promise.reject(new Error('network down')));

        const verdict = await verifyCaptcha({ token: 'a-token', action: 'sign_in' });

        expect(verdict.ok).toBe(false);
    });

    it('surfaces error-codes on failure, and never the secret', async () => {
        turnstile();
        stubFetch(() =>
            jsonResponse({ success: false, 'error-codes': ['invalid-input-response'] })
        );

        const verdict = await verifyCaptcha({ token: 'a-token', action: 'sign_in' });

        expect(verdict).toEqual({
            ok: false,
            reason: 'Verification failed (invalid-input-response)',
        });
    });

    it('sends remoteip only when the address is known', async () => {
        turnstile();
        stubFetch(() => jsonResponse({ success: true, action: 'sign_in' }));

        await verifyCaptcha({ token: 'a-token', action: 'sign_in' });
        await verifyCaptcha({
            token: 'a-token',
            action: 'sign_in',
            clientAddress: '203.0.113.9',
        });

        expect(requests.map((request) => request.body.get('remoteip'))).toEqual([
            null,
            '203.0.113.9',
        ]);
    });

    it('refuses a token from another hostname', async () => {
        turnstile();
        stubFetch(() =>
            jsonResponse({ success: true, action: 'sign_in', hostname: 'evil.test' })
        );

        const verdict = await verifyCaptcha({
            token: 'a-token',
            action: 'sign_in',
            hostname: 'example.test',
        });

        expect(verdict).toEqual({
            ok: false,
            reason: 'Hostname evil.test is not allowed',
        });
    });

    it('refuses a token that names no hostname when hostnames are expected', async () => {
        turnstile({ hostnames: ['example.test'] });
        stubFetch(() => jsonResponse({ success: true, action: 'sign_in' }));

        const verdict = await verifyCaptcha({ token: 'a-token', action: 'sign_in' });

        expect(verdict.ok).toBe(false);
    });

    it('accepts any configured hostname, over the request hostname', async () => {
        turnstile({ hostnames: ['www.example.test', 'example.test'] });
        stubFetch(() =>
            jsonResponse({ success: true, action: 'sign_in', hostname: 'example.test' })
        );

        const verdict = await verifyCaptcha({
            token: 'a-token',
            action: 'sign_in',
            hostname: 'internal.proxy',
        });

        expect(verdict).toEqual({ ok: true });
    });

    it('throws when no captcha is configured', async () => {
        setupTestConfig(makeTestConfig());

        await expect(
            verifyCaptcha({ token: 'a-token', action: 'sign_in' })
        ).rejects.toThrow('`security.captcha` is not configured');
    });
});

describe('Turnstile', () => {
    it('accepts a token for this action and hostname', async () => {
        turnstile();
        stubFetch(() =>
            jsonResponse({ success: true, action: 'sign_in', hostname: 'example.test' })
        );

        const verdict = await verifyCaptcha({
            token: 'a-token',
            action: 'sign_in',
            hostname: 'example.test',
        });

        expect(verdict).toEqual({ ok: true });
        expect(requests[0]?.url).toBe(TURNSTILE_URL);
        expect(Object.fromEntries(requests[0]?.body ?? [])).toEqual({
            secret: 'super-secret',
            response: 'a-token',
        });
    });

    it("refuses a token whose action is another form's", async () => {
        turnstile();
        stubFetch(() =>
            jsonResponse({ success: true, action: 'sign_in', hostname: 'example.test' })
        );

        const verdict = await verifyCaptcha({
            token: 'a-token',
            action: 'password_reset',
            hostname: 'example.test',
        });

        expect(verdict).toEqual({
            ok: false,
            reason: 'Token was issued for another action',
        });
    });
});

describe('reCAPTCHA', () => {
    function recaptcha(extra: Partial<CaptchaConfig> = {}): void {
        configure({ provider: 'recaptcha', siteKey: 'site-key', ...extra });
    }

    it('accepts a v3 score at or above the minimum', async () => {
        recaptcha();
        stubFetch(() => jsonResponse({ success: true, score: 0.9, action: 'sign_in' }));

        const verdict = await verifyCaptcha({ token: 'a-token', action: 'sign_in' });

        expect(verdict).toEqual({ ok: true });
        expect(requests[0]?.url).toBe(RECAPTCHA_URL);
    });

    it('rejects a score below minScore', async () => {
        recaptcha({ minScore: 0.7 });
        stubFetch(() => jsonResponse({ success: true, score: 0.6, action: 'sign_in' }));

        const verdict = await verifyCaptcha({ token: 'a-token', action: 'sign_in' });

        expect(verdict).toEqual({ ok: false, reason: 'Score 0.6 below minimum 0.7' });
    });

    it('defaults minScore to 0.5', async () => {
        recaptcha();
        stubFetch(() => jsonResponse({ success: true, score: 0.4, action: 'sign_in' }));

        const verdict = await verifyCaptcha({ token: 'a-token', action: 'sign_in' });

        expect(verdict.ok).toBe(false);
    });

    it('refuses a reCAPTCHA token with no action', async () => {
        recaptcha();
        stubFetch(() => jsonResponse({ success: true }));

        const verdict = await verifyCaptcha({ token: 'a-token', action: 'sign_in' });

        expect(verdict.ok).toBe(false);
    });

    it('refuses a token for another action', async () => {
        recaptcha();
        stubFetch(() => jsonResponse({ success: true, score: 0.9, action: 'sign_in' }));

        const verdict = await verifyCaptcha({
            token: 'a-token',
            action: 'form_submit',
        });

        expect(verdict.ok).toBe(false);
    });
});

describe('hCaptcha', () => {
    it('sends hCaptcha the site key and checks the hostname', async () => {
        configure({ provider: 'hcaptcha', siteKey: 'h-site-key' });
        stubFetch(() => jsonResponse({ success: true, hostname: 'example.test' }));

        const accepted = await verifyCaptcha({
            token: 'a-token',
            action: 'sign_in',
            hostname: 'example.test',
        });
        const refused = await verifyCaptcha({
            token: 'a-token',
            action: 'sign_in',
            hostname: 'other.test',
        });

        expect(accepted).toEqual({ ok: true });
        expect(refused.ok).toBe(false);
        expect(requests[0]?.url).toBe(HCAPTCHA_URL);
        expect(requests[0]?.body.get('sitekey')).toBe('h-site-key');
    });

    it('checks no action, which hCaptcha does not return', async () => {
        configure({ provider: 'hcaptcha', siteKey: 'h-site-key' });
        stubFetch(() => jsonResponse({ success: true }));

        const verdict = await verifyCaptcha({ token: 'a-token', action: 'sign_in' });

        expect(verdict).toEqual({ ok: true });
    });
});
