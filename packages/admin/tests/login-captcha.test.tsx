/**
 * @vitest-environment happy-dom
 *
 * With a captcha configured the sign-in form renders its widget for the
 * `sign_in` action and sends the token in `x-captcha-response`. The provider's
 * script is replaced by a stub on `window` that hands back a token at once.
 */

import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route as loginRoute } from '@/admin/pages/_auth/login';
import { renderAdmin } from './_support/render-admin';

const site = vi.hoisted(() => ({
    captcha: null as { provider: string; siteKey: string } | null,
}));

vi.mock('virtual:astromech/admin-config', () => ({
    default: {
        defaultLocale: 'en',
        locales: ['en'],
        entryTypes: {},
        pages: [],
        plugins: [],
        globals: {},
        get captcha() {
            return site.captcha;
        },
    },
}));

const fetchMock = vi.fn<typeof fetch>();
const turnstile = {
    render: vi.fn(),
    reset: vi.fn(),
    remove: vi.fn(),
};

beforeEach(() => {
    vi.stubGlobal('__ASTROMECH_BASE_PATH__', '/cms');
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('turnstile', turnstile);
    site.captcha = { provider: 'turnstile', siteKey: 'site-key' };
    turnstile.render.mockImplementation(
        (_container: HTMLElement, options: { callback: (token: string) => void }) => {
            options.callback('captcha-token');
            return 'widget-1';
        }
    );
    fetchMock.mockImplementation((input) =>
        Promise.resolve(
            new Response(
                JSON.stringify(
                    String(input) === '/cms/api/setup/check' ? { needsSetup: false } : {}
                ),
                { status: String(input) === '/cms/api/setup/check' ? 200 : 401 }
            )
        )
    );
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    fetchMock.mockReset();
});

function mountLogin(): ReturnType<typeof renderAdmin> {
    const page = loginRoute.options.component;
    if (page === undefined) throw new Error('the login route has no component');
    return renderAdmin([{ path: '/login', component: page }], {
        url: '/login',
        permissions: null,
    });
}

async function signIn(app: ReturnType<typeof renderAdmin>): Promise<void> {
    await app.user.type(await screen.findByLabelText('Email address'), 'a@test.dev');
    await app.user.type(screen.getByLabelText('Password'), 'a-password');
    await app.user.click(screen.getByRole('button', { name: 'Sign in' }));
}

/** The headers of the sign-in request, once it has been sent. */
function signInHeaders(): Record<string, string> {
    const call = fetchMock.mock.calls.find(
        ([url]) => String(url) === '/cms/api/auth/sign-in/email'
    );
    return (call?.[1]?.headers ?? {}) as Record<string, string>;
}

describe('the sign-in form with a captcha', () => {
    it('sends the captcha token with the sign-in', async () => {
        const app = mountLogin();

        await signIn(app);
        await screen.findByText('Login failed');

        expect(signInHeaders()['x-captcha-response']).toBe('captcha-token');
        expect(turnstile.render).toHaveBeenCalledWith(
            expect.any(HTMLElement),
            expect.objectContaining({ sitekey: 'site-key', action: 'sign_in' })
        );
    });

    it("shows the refusal's message and asks for a fresh token", async () => {
        fetchMock.mockImplementation((input) =>
            Promise.resolve(
                String(input) === '/cms/api/setup/check'
                    ? Response.json({ needsSetup: false })
                    : Response.json(
                          {
                              error: {
                                  code: 'ADDRESS_BLOCKED',
                                  message: 'Requests from this address are blocked.',
                              },
                          },
                          { status: 403 }
                      )
            )
        );
        const app = mountLogin();

        await signIn(app);

        expect(
            await screen.findByText('Requests from this address are blocked.')
        ).toBeTruthy();
        expect(turnstile.reset).toHaveBeenCalledWith('widget-1');
    });
});

describe('the sign-in form without a captcha', () => {
    it('renders no widget and sends no token', async () => {
        site.captcha = null;
        const app = mountLogin();

        await signIn(app);
        await screen.findByText('Login failed');

        expect(turnstile.render).not.toHaveBeenCalled();
        expect(signInHeaders()['x-captcha-response']).toBeUndefined();
    });
});
