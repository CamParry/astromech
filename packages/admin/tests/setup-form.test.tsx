/**
 * @vitest-environment happy-dom
 *
 * The first-run setup form: it shows the user fields only when a required one
 * has no default, sends them as `data.fields`, and shows a 422's field errors
 * on the field they name.
 */

import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route as setupRoute } from '@/admin/pages/_auth/setup';
import { renderAdmin } from './_support/render-admin';

const { adminConfig } = vi.hoisted(() => ({
    adminConfig: {
        defaultLocale: 'en',
        locales: ['en'],
        users: { translatable: false, fields: [] as unknown[] },
    },
}));

vi.mock('virtual:astromech/admin-config', () => ({ default: adminConfig }));

const fetchMock = vi.fn<typeof fetch>();

/** What `POST /api/setup` answers in the current test. */
let setupResponse: () => Response;

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

beforeEach(() => {
    vi.stubGlobal('__ASTROMECH_BASE_PATH__', '/cms');
    vi.stubGlobal('fetch', fetchMock);
    adminConfig.users.fields = [];
    setupResponse = () => json({ success: true });
    fetchMock.mockImplementation((input) => {
        const url = String(input);
        if (url === '/cms/api/setup/check')
            return Promise.resolve(json({ needsSetup: true }));
        if (url === '/cms/api/setup') return Promise.resolve(setupResponse());
        if (url === '/cms/api/auth/sign-in/email') return Promise.resolve(json({}));
        return Promise.resolve(json({ error: { code: 'UNAUTHORIZED' } }, 401));
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
});

function mountPage(): ReturnType<typeof renderAdmin> {
    const page = setupRoute.options.component;
    if (page === undefined) throw new Error('the setup route has no component');
    // Signed out, as a visitor to the page is.
    return renderAdmin(
        [
            { path: '/setup', component: page },
            { path: '/', component: () => <></> },
        ],
        { url: '/setup', permissions: null }
    );
}

async function fillAccount(page: ReturnType<typeof renderAdmin>): Promise<void> {
    await page.user.type(await screen.findByLabelText('Name'), 'Ada');
    await page.user.type(screen.getByLabelText('Email'), 'ada@test.dev');
    await page.user.type(screen.getByLabelText('Password'), 'password123');
    await page.user.type(screen.getByLabelText('Confirm password'), 'password123');
}

/** The JSON body of the `POST /api/setup` the form sent. */
function setupBody(): unknown {
    const call = fetchMock.mock.calls.find(([url]) => String(url) === '/cms/api/setup');
    if (call === undefined) throw new Error('the form sent no setup request');
    return JSON.parse(String(call[1]?.body));
}

const team = { name: 'team', type: 'text', label: 'Team', required: true };

describe('the setup form', () => {
    it('leaves the user fields out when every required one has a default', async () => {
        adminConfig.users.fields = [{ ...team, defaultValue: 'Ops' }];
        const page = mountPage();

        await fillAccount(page);

        expect(screen.queryByLabelText(/Team/)).toBeNull();
    });

    it('asks for a required user field with no default and sends it as data.fields', async () => {
        adminConfig.users.fields = [team];
        const page = mountPage();

        await fillAccount(page);
        await page.user.type(screen.getByLabelText(/Team/), 'Ops');
        await page.user.click(screen.getByRole('button', { name: 'Create account' }));

        await waitFor(() =>
            expect(setupBody()).toEqual({
                name: 'Ada',
                email: 'ada@test.dev',
                password: 'password123',
                data: { fields: { team: 'Ops' } },
            })
        );
    });

    it('shows a 422 field error on the user field it names', async () => {
        adminConfig.users.fields = [team];
        setupResponse = () =>
            json(
                {
                    error: {
                        id: 'e1',
                        code: 'VALIDATION_ERROR',
                        message: 'Validation failed',
                        status: 422,
                        details: { fields: { team: ['Team is taken'] } },
                    },
                },
                422
            );
        const page = mountPage();

        await fillAccount(page);
        await page.user.type(screen.getByLabelText(/Team/), 'Ops');
        await page.user.click(screen.getByRole('button', { name: 'Create account' }));

        expect(await screen.findByText('Team is taken')).toBeDefined();
        expect(page.location()).toBe('/setup');
    });

    it('refuses mismatched passwords without sending anything', async () => {
        const page = mountPage();

        await page.user.type(await screen.findByLabelText('Name'), 'Ada');
        await page.user.type(screen.getByLabelText('Email'), 'ada@test.dev');
        await page.user.type(screen.getByLabelText('Password'), 'password123');
        await page.user.type(screen.getByLabelText('Confirm password'), 'password124');
        await page.user.click(screen.getByRole('button', { name: 'Create account' }));

        expect(await screen.findByText('Passwords do not match')).toBeDefined();
        expect(fetchMock.mock.calls.map(([url]) => String(url))).not.toContain(
            '/cms/api/setup'
        );
    });
});
