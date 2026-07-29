/**
 * Unit tests for the forms plugin's spam gate:
 * - `verifySpamToken` — the Turnstile/reCAPTCHA network client. `fetch` is
 *   stubbed at the boundary; this is a network client, so stubbing HTTP here
 *   is correct and is NOT the "never mock the DB" rule.
 * - `spamHook` — the `forms:beforeSubmit` subscriber that turns a bad verdict
 *   into a throw (the gate).
 *
 * These are plain unit tests with no plugin registration or DB, so they
 * import the source files directly rather than through the (not yet built)
 * `@astromech/forms` package alias.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifySpamToken } from '../../../../plugins/forms/src/spam/verify.js';
import { spamHook } from '../../../../plugins/forms/src/spam/hook.js';
import { BEFORE_SUBMIT } from '../../../../plugins/forms/src/hooks/events.js';
import type { FormsBeforeSubmitPayload } from '../../../../plugins/forms/src/hooks/events.js';
import type { SpamOptions } from '../../../../plugins/forms/src/types.js';
import type { PluginContext } from 'astromech';

const turnstile: SpamOptions = {
    provider: 'turnstile',
    siteKey: 'site-key',
    secretKey: 'super-secret',
};

const recaptcha: SpamOptions = {
    provider: 'recaptcha',
    siteKey: 'site-key',
    secretKey: 'super-secret',
};

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('verifySpamToken', () => {
    it('short-circuits on a missing token without calling fetch', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const verdict = await verifySpamToken(turnstile, undefined);

        expect(verdict).toEqual({ ok: false, reason: 'Missing verification token' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('short-circuits on a blank token without calling fetch', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const verdict = await verifySpamToken(turnstile, '   ');

        expect(verdict.ok).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('accepts a successful turnstile verification', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
        vi.stubGlobal('fetch', fetchMock);

        const verdict = await verifySpamToken(turnstile, 'a-token');

        expect(verdict).toEqual({ ok: true });
        expect(fetchMock).toHaveBeenCalledWith(
            'https://challenges.cloudflare.com/turnstile/v0/siteverify',
            expect.objectContaining({ method: 'POST' })
        );
    });

    it('surfaces turnstile error-codes on failure', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(
                jsonResponse({
                    success: false,
                    'error-codes': ['invalid-input-response'],
                })
            );
        vi.stubGlobal('fetch', fetchMock);

        const verdict = await verifySpamToken(turnstile, 'a-token');

        expect(verdict.ok).toBe(false);
        expect(verdict.ok === false && verdict.reason).toContain(
            'invalid-input-response'
        );
    });

    it('rejects a reCAPTCHA v3 score below minScore', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(jsonResponse({ success: true, score: 0.2 }));
        vi.stubGlobal('fetch', fetchMock);

        const verdict = await verifySpamToken({ ...recaptcha, minScore: 0.5 }, 'a-token');

        expect(verdict.ok).toBe(false);
    });

    it('accepts a reCAPTCHA v2 response with no score, on success alone', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
        vi.stubGlobal('fetch', fetchMock);

        const verdict = await verifySpamToken(recaptcha, 'a-token');

        expect(verdict).toEqual({ ok: true });
    });

    it('fails closed on a non-200 response', async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }, 500));
        vi.stubGlobal('fetch', fetchMock);

        const verdict = await verifySpamToken(turnstile, 'a-token');

        expect(verdict.ok).toBe(false);
    });

    it('fails closed on a malformed JSON body', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(
                new Response('not json', {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                })
            );
        vi.stubGlobal('fetch', fetchMock);

        const verdict = await verifySpamToken(turnstile, 'a-token');

        expect(verdict.ok).toBe(false);
    });

    it('fails closed when fetch itself throws', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
        vi.stubGlobal('fetch', fetchMock);

        const verdict = await verifySpamToken(turnstile, 'a-token');

        expect(verdict.ok).toBe(false);
    });

    it('never includes secretKey in a returned reason', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(
                jsonResponse({ success: false, 'error-codes': ['bad-secret'] })
            );
        vi.stubGlobal('fetch', fetchMock);

        const verdict = await verifySpamToken(turnstile, 'a-token');

        expect(verdict.ok).toBe(false);
        expect(verdict.ok === false && verdict.reason).not.toContain(turnstile.secretKey);
    });
});

// `DefinedHook.handler` is typed as a union of every core handler signature
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
        const hook = spamHook(turnstile);
        expect(hook.event).toBe(BEFORE_SUBMIT);
    });

    it('throws when the verdict is a failure', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(jsonResponse({ success: false }))
        );
        const hook = spamHook(turnstile);
        const handler = hook.handler as SpamHandler;

        await expect(handler(payloadWith(), ctx)).rejects.toThrow(/Spam check failed/);
    });

    it('returns quietly when the verdict succeeds', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(jsonResponse({ success: true }))
        );
        const hook = spamHook(turnstile);
        const handler = hook.handler as SpamHandler;

        await expect(handler(payloadWith(), ctx)).resolves.toBeUndefined();
    });

    it('skips verification entirely when spamProtection is false', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const hook = spamHook(turnstile);
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
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
