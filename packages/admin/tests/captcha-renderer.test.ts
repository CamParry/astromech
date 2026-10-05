/**
 * @vitest-environment happy-dom
 *
 * The browser renderer core ships through `astromech/shared`: one script per
 * provider per page, and one widget per form with its own action.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderCaptcha } from '@/security/captcha/client';

type RenderOptions = { callback: (token: string) => void } & Record<string, unknown>;

const turnstile = {
    render: vi.fn((_container: HTMLElement, _options: RenderOptions) => 'widget'),
    reset: vi.fn(),
    remove: vi.fn(),
};

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

describe('renderCaptcha', () => {
    it('renders two widgets with one script and each its own action', async () => {
        // happy-dom refuses to load a script, so the page's `<head>` only records it.
        const added: HTMLScriptElement[] = [];
        vi.spyOn(document.head, 'append').mockImplementation((script) => {
            if (script instanceof HTMLScriptElement) added.push(script);
        });
        const first = document.createElement('div');
        const second = document.createElement('div');
        const pending = [
            renderCaptcha(first, {
                provider: 'turnstile',
                siteKey: 'site-key',
                action: 'sign_in',
            }),
            renderCaptcha(second, {
                provider: 'turnstile',
                siteKey: 'site-key',
                action: 'password_reset',
            }),
        ];

        // The provider's script is the only thing that defines the global.
        expect(added).toHaveLength(1);
        expect(added[0]?.src).toBe(
            'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
        );
        vi.stubGlobal('turnstile', turnstile);
        added[0]?.dispatchEvent(new Event('load'));
        await Promise.all(pending);

        expect(turnstile.render.mock.calls).toEqual([
            [first, expect.objectContaining({ sitekey: 'site-key', action: 'sign_in' })],
            [
                second,
                expect.objectContaining({
                    sitekey: 'site-key',
                    action: 'password_reset',
                }),
            ],
        ]);
    });

    it('adds no script once the provider is loaded', async () => {
        const append = vi.spyOn(document.head, 'append');
        vi.stubGlobal('turnstile', turnstile);

        await renderCaptcha(document.createElement('div'), {
            provider: 'turnstile',
            siteKey: 'site-key',
            action: 'sign_in',
        });

        expect(append).not.toHaveBeenCalled();
    });

    it('resolves the token the widget hands back, and renews it after a reset', async () => {
        vi.stubGlobal('turnstile', turnstile);
        const handle = await renderCaptcha(document.createElement('div'), {
            provider: 'turnstile',
            siteKey: 'site-key',
            action: 'sign_in',
        });
        const options = lastRenderOptions();

        const waiting = handle.getToken();
        options.callback('first-token');
        expect(await waiting).toBe('first-token');

        handle.reset();
        const next = handle.getToken();
        options.callback('second-token');

        expect(await next).toBe('second-token');
        expect(turnstile.reset).toHaveBeenCalledWith('widget');
    });

    it('executes reCAPTCHA v3 for the action on each call', async () => {
        const execute = vi.fn().mockResolvedValue('v3-token');
        vi.stubGlobal('grecaptcha', { ready: (run: () => void) => run(), execute });
        const handle = await renderCaptcha(document.createElement('div'), {
            provider: 'recaptcha',
            siteKey: 'v3-key',
            action: 'sign_in',
        });

        expect(await handle.getToken()).toBe('v3-token');
        expect(execute).toHaveBeenCalledWith('v3-key', { action: 'sign_in' });
    });

    it('sends hCaptcha no action, which it does not return', async () => {
        const hcaptcha = {
            render: vi.fn((_container: HTMLElement, _options: RenderOptions) => 'h'),
            reset: vi.fn(),
            remove: vi.fn(),
        };
        vi.stubGlobal('hcaptcha', hcaptcha);

        await renderCaptcha(document.createElement('div'), {
            provider: 'hcaptcha',
            siteKey: 'h-key',
            action: 'sign_in',
        });

        const options = hcaptcha.render.mock.calls[0]?.[1];
        if (options === undefined) throw new Error('hcaptcha.render was not called');
        expect(options['sitekey']).toBe('h-key');
        expect('action' in options).toBe(false);
    });
});

/** The options the last `turnstile.render` call received. */
function lastRenderOptions(): RenderOptions {
    const options = turnstile.render.mock.calls.at(-1)?.[1];
    if (options === undefined) throw new Error('turnstile.render was not called');
    return options;
}
