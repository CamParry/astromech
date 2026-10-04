/**
 * Unit tests for the forms plugin's spam gate:
 * - `turnstile`/`recaptcha` — the built-in `SpamProvider` factories, both
 *   built on the shared `siteverify` POST client. `fetch` is stubbed at the
 *   boundary; this is a network client, so stubbing HTTP here is correct and
 *   is NOT the "never mock the DB" rule.
 * - `spamHook` — the `forms:beforeSubmit` subscriber that turns a bad verdict
 *   into a throw (the gate), tested against a hand-written `SpamProvider` stub.
 * - the address sent as `remoteip`, through a registered plugin over HTTP.
 */

import type { FormsBeforeSubmitPayload } from '../src/hooks/events';
import type { FormsOptions } from '../src/index';
import type { SpamProvider } from '../src/spam/types';
import type { PluginTestApp } from '@tests/plugin-app';
import type { PluginContext } from 'astromech';
import { makeTestConfig } from '@tests/harness';
import { createPluginTestApp } from '@tests/plugin-app';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BEFORE_SUBMIT } from '../src/hooks/events';
import { forms } from '../src/index';
import { spamHook } from '../src/spam/hook';
import { recaptcha } from '../src/spam/providers/recaptcha';
import { turnstile } from '../src/spam/providers/turnstile';

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('turnstile', () => {
    const provider = turnstile({ siteKey: 'site-key', secretKey: 'super-secret' });

    it('short-circuits on a missing token without calling fetch', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const verdict = await provider.verify(undefined, {});

        expect(verdict).toEqual({ ok: false, reason: 'Missing verification token' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('short-circuits on a blank token without calling fetch', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const verdict = await provider.verify('   ', {});

        expect(verdict.ok).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('accepts a successful verification', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
        vi.stubGlobal('fetch', fetchMock);

        const verdict = await provider.verify('a-token', {});

        expect(verdict).toEqual({ ok: true });
        expect(fetchMock).toHaveBeenCalledWith(
            'https://challenges.cloudflare.com/turnstile/v0/siteverify',
            expect.objectContaining({ method: 'POST' })
        );
    });

    it('surfaces error-codes on failure', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            jsonResponse({
                success: false,
                'error-codes': ['invalid-input-response'],
            })
        );
        vi.stubGlobal('fetch', fetchMock);

        const verdict = await provider.verify('a-token', {});

        expect(verdict.ok).toBe(false);
        expect(verdict.ok === false && verdict.reason).toContain(
            'invalid-input-response'
        );
    });

    it('fails closed on a non-200 response', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }, 500));
        vi.stubGlobal('fetch', fetchMock);

        const verdict = await provider.verify('a-token', {});

        expect(verdict.ok).toBe(false);
    });

    it('fails closed on a malformed JSON body', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response('not json', {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            })
        );
        vi.stubGlobal('fetch', fetchMock);

        const verdict = await provider.verify('a-token', {});

        expect(verdict.ok).toBe(false);
    });

    it('fails closed when fetch itself throws', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
        vi.stubGlobal('fetch', fetchMock);

        const verdict = await provider.verify('a-token', {});

        expect(verdict.ok).toBe(false);
    });

    it('never includes secretKey in a returned reason', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(
                jsonResponse({ success: false, 'error-codes': ['bad-secret'] })
            );
        vi.stubGlobal('fetch', fetchMock);

        const verdict = await provider.verify('a-token', {});

        expect(verdict.ok).toBe(false);
        expect(verdict.ok === false && verdict.reason).not.toContain('super-secret');
    });
});

describe('recaptcha', () => {
    it('rejects a v3 score below minScore', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(jsonResponse({ success: true, score: 0.2 }));
        vi.stubGlobal('fetch', fetchMock);
        const provider = recaptcha({
            siteKey: 'site-key',
            secretKey: 'super-secret',
            minScore: 0.5,
        });

        const verdict = await provider.verify('a-token', {});

        expect(verdict.ok).toBe(false);
        expect(verdict.ok === false && verdict.reason).toContain('below minimum');
    });

    it('accepts a v3 score at or above minScore', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(jsonResponse({ success: true, score: 0.9 }));
        vi.stubGlobal('fetch', fetchMock);
        const provider = recaptcha({ siteKey: 'site-key', secretKey: 'super-secret' });

        const verdict = await provider.verify('a-token', {});

        expect(verdict).toEqual({ ok: true });
    });

    it('accepts a v2 response with no score, on success alone', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
        vi.stubGlobal('fetch', fetchMock);
        const provider = recaptcha({ siteKey: 'site-key', secretKey: 'super-secret' });

        const verdict = await provider.verify('a-token', {});

        expect(verdict).toEqual({ ok: true });
    });

    it('defaults minScore to 0.5 when not given', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(jsonResponse({ success: true, score: 0.4 }));
        vi.stubGlobal('fetch', fetchMock);
        const provider = recaptcha({ siteKey: 'site-key', secretKey: 'super-secret' });

        const verdict = await provider.verify('a-token', {});

        expect(verdict.ok).toBe(false);
    });

    it('fails closed on a non-200 response', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }, 500));
        vi.stubGlobal('fetch', fetchMock);
        const provider = recaptcha({ siteKey: 'site-key', secretKey: 'super-secret' });

        const verdict = await provider.verify('a-token', {});

        expect(verdict.ok).toBe(false);
    });
});

// `Hook.handler` is typed as a union of every core handler signature
// plus the generic custom-event one, so it has no single call signature.
// `forms:beforeSubmit` isn't in `AstromechPluginHookEvents` at this package's
// build time (see `spam/hook.ts`), so narrow it back to the shape it's
// actually built with before invoking it directly.
type SpamHandler = (
    payload: FormsBeforeSubmitPayload,
    ctx: PluginContext
) => Promise<void> | void;

describe('spamHook', () => {
    const ctx = {} as PluginContext;

    function stubProvider(verify: SpamProvider['verify']): SpamProvider {
        return { name: 'test', siteKey: 'k', verify };
    }

    function payloadWith(
        overrides: Partial<FormsBeforeSubmitPayload> = {}
    ): FormsBeforeSubmitPayload {
        return {
            form: { id: 'f1', slug: 'contact', title: 'Contact', spamProtection: true },
            data: {},
            token: 'a-token',
            ...overrides,
        };
    }

    it('is registered against forms:beforeSubmit', () => {
        const hook = spamHook(stubProvider(vi.fn()));
        expect(hook.event).toBe(BEFORE_SUBMIT);
    });

    it('throws when the verdict is a failure', async () => {
        const hook = spamHook(
            stubProvider(vi.fn().mockResolvedValue({ ok: false, reason: 'nope' }))
        );
        const handler = hook.handler as SpamHandler;

        await expect(handler(payloadWith(), ctx)).rejects.toThrow(/Spam check failed/);
    });

    it('returns quietly when the verdict succeeds', async () => {
        const hook = spamHook(stubProvider(vi.fn().mockResolvedValue({ ok: true })));
        const handler = hook.handler as SpamHandler;

        await expect(handler(payloadWith(), ctx)).resolves.toBeUndefined();
    });

    it('skips verification entirely when spamProtection is false', async () => {
        const verify = vi.fn();
        const hook = spamHook(stubProvider(verify));
        const handler = hook.handler as SpamHandler;

        await expect(
            handler(
                payloadWith({
                    form: {
                        id: 'f1',
                        slug: 'contact',
                        title: 'Contact',
                        spamProtection: false,
                    },
                }),
                ctx
            )
        ).resolves.toBeUndefined();
        expect(verify).not.toHaveBeenCalled();
    });

    it('passes the token and the trusted address through to verify', async () => {
        const verify = vi.fn().mockResolvedValue({ ok: true });
        const hook = spamHook(stubProvider(verify));
        const handler = hook.handler as SpamHandler;

        await handler(
            payloadWith({ clientAddress: '1.2.3.4', meta: { ip: '203.0.113.66' } }),
            ctx
        );

        expect(verify).toHaveBeenCalledWith('a-token', { clientAddress: '1.2.3.4' });
    });
});

describe('the address sent to the spam provider', () => {
    const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

    let app: PluginTestApp<'forms'>;

    /** The `remoteip` of each siteverify request, `null` where none was sent. */
    let sentAddresses: (string | null)[];

    async function setup(security: { trustProxy: boolean }): Promise<void> {
        const options: FormsOptions = {
            spam: turnstile({ siteKey: 'site-key', secretKey: 'super-secret' }),
            rateLimit: false,
        };
        app = await createPluginTestApp('forms', {
            ...makeTestConfig(),
            security,
            plugins: [forms(options)],
        });
        await app.entries.create({
            type: 'forms/form',
            data: {
                title: 'Contact',
                slug: 'contact',
                status: 'published',
                fields: {
                    enabled: true,
                    fields: [{ _type: 'text', _id: 'b1', name: 'name', label: 'Name' }],
                },
            },
        });
        sentAddresses = [];
        vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
            expect(url).toBe(VERIFY_URL);
            const body = new URLSearchParams(String(init.body));
            sentAddresses.push(body.get('remoteip'));
            return jsonResponse({ success: true });
        });
    }

    /** Submit with a spoofed `meta.ip` and `forwardedFor` as `x-forwarded-for`. */
    async function submit(forwardedFor: string): Promise<unknown> {
        const response = await app.request('POST', '/plugins/forms/submit', {
            body: {
                slug: 'contact',
                data: { name: 'Ada' },
                token: 'a-token',
                meta: { ip: '203.0.113.66' },
            },
            headers: { 'x-forwarded-for': forwardedFor },
        });
        return response.json();
    }

    it('sends the address the proxy vouches for, never the caller’s own', async () => {
        await setup({ trustProxy: true });

        const result = await submit('198.51.100.1, 192.0.2.10');

        expect(result).toEqual({ ok: true, id: expect.any(String) });
        expect(sentAddresses).toEqual(['192.0.2.10']);
    });

    it('sends no address when the transport has no trusted one', async () => {
        await setup({ trustProxy: false });

        const result = await submit('198.51.100.1');

        expect(result).toEqual({ ok: true, id: expect.any(String) });
        expect(sentAddresses).toEqual([null]);
    });
});
