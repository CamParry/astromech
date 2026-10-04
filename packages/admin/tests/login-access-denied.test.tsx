/**
 * @vitest-environment happy-dom
 *
 * A signed-in user without `admin:access` is signed out and sent to the login
 * page, which says why, whether they open an admin page or sign in through the
 * form. A signed-out visitor reaches the login page with no message.
 */

import type { TestRoute } from './_support/render-admin';
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionQueryOptions } from '@/admin/context/auth';
import { Route as loginRoute } from '@/admin/pages/_auth/login';
import { Route as authRoute } from '@/admin/pages/_auth/route';
import { Route as protectedRoute } from '@/admin/pages/_protected/route';
import { renderAdmin } from './_support/render-admin';

const ACCESS_DENIED = 'Your account does not have access to the admin.';

const fetchMock = vi.fn<typeof fetch>();

/** The permissions `GET /api/me` answers for, or null when no one is signed in. */
let signedInPermissions: string[] | null;

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

beforeEach(() => {
    vi.stubGlobal('__ASTROMECH_BASE_PATH__', '/cms');
    vi.stubGlobal('fetch', fetchMock);
    signedInPermissions = null;
    fetchMock.mockImplementation((input) => {
        const url = String(input);
        if (url === '/cms/api/setup/check')
            return Promise.resolve(json({ needsSetup: false }));
        if (url === '/cms/api/auth/sign-in/email') {
            signedInPermissions = [];
            return Promise.resolve(json({}));
        }
        if (url === '/cms/api/auth/sign-out') {
            signedInPermissions = null;
            return Promise.resolve(json({ success: true }));
        }
        if (url === '/cms/api/me' && signedInPermissions !== null) {
            return Promise.resolve(
                json({
                    data: {
                        user: {
                            id: 'u2',
                            name: 'Subscriber',
                            email: 'subscriber@test.dev',
                            image: null,
                            role: 'subscriber',
                        },
                        role: { permissions: signedInPermissions },
                    },
                })
            );
        }
        return Promise.resolve(json({ error: { code: 'UNAUTHORIZED' } }, 401));
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
});

/** The app's guarded index page and its login page, behind their real guards. */
function routes(): TestRoute[] {
    const loginPage = loginRoute.options.component;
    if (loginPage === undefined) throw new Error('the login route has no component');
    const protectedGuard = protectedRoute.options.beforeLoad as unknown as Guard;
    const authGuard = authRoute.options.beforeLoad as unknown as Guard;
    const loginGuard = loginRoute.options.beforeLoad as unknown as Guard;
    const validateLoginSearch = loginRoute.options.validateSearch as SearchValidator;
    return [
        { path: '/', beforeLoad: protectedGuard, component: () => <h1>Dashboard</h1> },
        {
            path: '/login',
            // The `_auth` layout's guard runs before the login route's own.
            beforeLoad: async (arg) => {
                await authGuard(arg);
                await loginGuard(arg);
            },
            validateSearch: validateLoginSearch,
            component: loginPage,
        },
    ];
}

type Guard = NonNullable<TestRoute['beforeLoad']>;
type SearchValidator = NonNullable<TestRoute['validateSearch']>;

function signOutCalls(): number {
    return fetchMock.mock.calls.filter(
        ([url]) => String(url) === '/cms/api/auth/sign-out'
    ).length;
}

describe('a user without admin access', () => {
    it('is signed out and told why when they open the admin', async () => {
        signedInPermissions = [];
        const app = renderAdmin(routes(), { permissions: [] });

        expect(await screen.findByText(ACCESS_DENIED)).toBeTruthy();
        expect(app.pathname()).toBe('/login');
        expect(signOutCalls()).toBe(1);
        expect(app.queryClient.getQueryData(sessionQueryOptions.queryKey)).toBeNull();
    });

    it('is signed out and told why when they sign in through the form', async () => {
        const app = renderAdmin(routes(), { url: '/login', permissions: null });

        await app.user.type(
            await screen.findByLabelText('Email address'),
            'subscriber@test.dev'
        );
        await app.user.type(screen.getByLabelText('Password'), 'correct-password');
        await app.user.click(screen.getByRole('button', { name: 'Sign in' }));

        expect(await screen.findByText(ACCESS_DENIED)).toBeTruthy();
        expect(app.pathname()).toBe('/login');
        expect(signOutCalls()).toBe(1);
        expect(app.queryClient.getQueryData(sessionQueryOptions.queryKey)).toBeNull();
        expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
    });
});

describe('a signed-out visitor', () => {
    it('reaches the login page with no message', async () => {
        const app = renderAdmin(routes(), { permissions: null });

        expect(await screen.findByLabelText('Email address')).toBeTruthy();
        expect(app.pathname()).toBe('/login');
        expect(screen.queryByText(ACCESS_DENIED)).toBeNull();
        expect(signOutCalls()).toBe(0);
    });
});
