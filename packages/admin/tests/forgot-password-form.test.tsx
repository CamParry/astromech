/**
 * @vitest-environment happy-dom
 *
 * The forgot-password form posts to Better Auth's `request-password-reset`, with
 * the email and the admin's reset page as `redirectTo`.
 */

import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    Outlet,
    RouterProvider,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/admin/locales/en.json';
import { Route as forgotPasswordRoute } from '@/admin/pages/_auth/forgot-password';

const fetchMock = vi.fn<typeof fetch>();

beforeAll(async () => {
    await i18n.use(initReactI18next).init({
        lng: 'en',
        resources: { en: { translation: en } },
    });
});

beforeEach(() => {
    vi.stubGlobal('__ASTROMECH_BASE_PATH__', '/cms');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ status: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        })
    );
});

afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
});

function mountPage(): void {
    const page = forgotPasswordRoute.options.component;
    if (page === undefined) throw new Error('the forgot-password route has no component');
    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const pageRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/forgot-password',
        component: page,
    });
    const loginRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/login',
        component: () => null,
    });
    const router = createRouter({
        routeTree: rootRoute.addChildren([pageRoute, loginRoute]),
        history: createMemoryHistory({ initialEntries: ['/forgot-password'] }),
    });
    render(<RouterProvider router={router} />);
}

describe('the forgot-password form', () => {
    it('posts the email to request-password-reset', async () => {
        mountPage();

        await userEvent.type(
            await screen.findByLabelText('Email address'),
            'invited@test.dev'
        );
        await userEvent.click(screen.getByRole('button'));
        await screen.findByText('Check your email');

        expect(fetchMock).toHaveBeenCalledOnce();
        const [url, init] = fetchMock.mock.calls[0] ?? [];
        expect(url).toBe('/cms/api/auth/request-password-reset');
        expect(JSON.parse(String(init?.body))).toEqual({
            email: 'invited@test.dev',
            redirectTo: `${window.location.origin}/cms/reset-password`,
        });
    });
});
