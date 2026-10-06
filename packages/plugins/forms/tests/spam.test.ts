/**
 * The forms plugin's spam gate:
 * - `spamHook` — the `forms:beforeSubmit` subscriber that turns a bad verdict
 *   into a throw, tested against a hand-written `SpamProvider` stub.
 * - core's captcha as the default provider, through a registered plugin over
 *   HTTP. `fetch` is stubbed because siteverify leaves the process.
 */

import type { FormsBeforeSubmitPayload } from '../src/hooks/events';
import type { FormsOptions } from '../src/index';
import type { SpamProvider } from '../src/spam/types';
import type { PluginTestApp } from '@tests/plugin-app';
import type { PluginContext } from 'astromech';
import { expectConsole } from '@tests/console';
import { makeTestConfig } from '@tests/harness';
import { createPluginTestApp } from '@tests/plugin-app';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearEnvSource, setEnvSource } from '@/env';
import { BEFORE_SUBMIT } from '../src/hooks/events';
import { forms } from '../src/index';
import { spamHook } from '../src/spam/hook';

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

afterEach(() => {
    vi.unstubAllGlobals();
    clearEnvSource();
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

describe("core's captcha as the spam provider", () => {
    const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

    let app: PluginTestApp<'forms'>;

    /** The form body of each siteverify request. */
    let sent: URLSearchParams[];

    async function setup(
        options: FormsOptions,
        security: {
            trustProxy: boolean;
            captcha?: { provider: 'turnstile'; siteKey: string };
        }
    ): Promise<void> {
        app = await createPluginTestApp('forms', {
            ...makeTestConfig(),
            security,
            plugins: [forms({ rateLimit: false, ...options })],
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
        setEnvSource({ ASTROMECH_CAPTCHA_SECRET: 'captcha-secret' });
        sent = [];
        vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
            expect(url).toBe(VERIFY_URL);
            sent.push(new URLSearchParams(String(init.body)));
            return Promise.resolve(
                jsonResponse({
                    success: true,
                    action: 'form_submit',
                    hostname: 'localhost',
                })
            );
        });
    }

    /** Submit with a spoofed `meta.ip` and `forwardedFor` as `x-forwarded-for`. */
    async function submit(forwardedFor = '192.0.2.10'): Promise<unknown> {
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

    const CAPTCHA = { provider: 'turnstile', siteKey: 'site-key' } as const;

    /** Core's warning for an `x-forwarded-for` it does not read without `trustProxy`. */
    const PROXY_WARNING = 'set `security.trustProxy`';

    it("uses core's captcha when the site configures one and passes no spam option", async () => {
        await setup({}, { trustProxy: false, captcha: CAPTCHA });
        expectConsole('error', PROXY_WARNING);

        const result = await submit();
        const form = await app.service.get({ slug: 'contact' });

        expect(result).toEqual({ ok: true, id: expect.any(String) });
        expect(sent.map((body) => body.get('secret'))).toEqual(['captcha-secret']);
        expect(form?.spam).toEqual({
            provider: 'turnstile',
            siteKey: 'site-key',
            action: 'form_submit',
        });
    });

    it("refuses a submission whose token core's captcha refuses", async () => {
        await setup({}, { trustProxy: false, captcha: CAPTCHA });
        expectConsole('error', PROXY_WARNING);
        vi.stubGlobal('fetch', () =>
            Promise.resolve(
                jsonResponse({ success: true, action: 'sign_in', hostname: 'localhost' })
            )
        );

        const result = await submit();

        expect(result).toEqual({
            ok: false,
            errors: {
                _form: ['Spam check failed: Token was issued for another action'],
            },
        });
    });

    it("a spam option overrides core's captcha", async () => {
        const verify = vi.fn().mockResolvedValue({ ok: true });
        await setup(
            { spam: { name: 'own', siteKey: 'own-key', verify } },
            { trustProxy: false, captcha: CAPTCHA }
        );
        expectConsole('error', PROXY_WARNING);

        const result = await submit();
        const form = await app.service.get({ slug: 'contact' });

        expect(result).toEqual({ ok: true, id: expect.any(String) });
        expect(verify).toHaveBeenCalledOnce();
        expect(sent).toEqual([]);
        expect(form?.spam?.provider).toBe('own');
    });

    it('checks nothing when the site sets neither', async () => {
        await setup({}, { trustProxy: false });
        expectConsole('error', PROXY_WARNING);

        const result = await submit();
        const form = await app.service.get({ slug: 'contact' });

        expect(result).toEqual({ ok: true, id: expect.any(String) });
        expect(sent).toEqual([]);
        expect(form?.spam).toBeUndefined();
    });

    it('sends the address the proxy vouches for, never the caller’s own', async () => {
        await setup({}, { trustProxy: true, captcha: CAPTCHA });

        const result = await submit('198.51.100.1, 192.0.2.10');

        expect(result).toEqual({ ok: true, id: expect.any(String) });
        expect(sent.map((body) => body.get('remoteip'))).toEqual(['192.0.2.10']);
    });

    it('sends no address when the transport has no trusted one', async () => {
        await setup({}, { trustProxy: false, captcha: CAPTCHA });
        expectConsole('error', PROXY_WARNING);

        const result = await submit('198.51.100.1');

        expect(result).toEqual({ ok: true, id: expect.any(String) });
        expect(sent.map((body) => body.get('remoteip'))).toEqual([null]);
    });
});
