/**
 * @vitest-environment happy-dom
 *
 * The first-run setup form: it shows the user fields only when a required one
 * has no default or the server names one, sends them as `data.fields`, shows a
 * 422's field errors on the field they name and any other refusal inline, and
 * says what to do when a required picker field has no default. Enter in a user
 * field submits, unless the input belongs to a form or popover of its own.
 */

import type { BaseFieldProps } from '@/types/index';
import { Popover } from '@base-ui/react/popover';
import { screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route as setupRoute } from '@/admin/pages/_auth/setup';
import { renderAdmin } from './_support/render-admin';

const { adminConfig, fieldTypes } = vi.hoisted(() => ({
    adminConfig: {
        defaultLocale: 'en',
        locales: ['en'],
        users: { translatable: false, fields: [] as unknown[] },
    },
    fieldTypes: {} as Record<string, unknown>,
}));

vi.mock('virtual:astromech/admin-config', () => ({ default: adminConfig }));

vi.mock('virtual:astromech/plugins/components', () => ({
    fieldTypes,
    pages: {},
    hostPages: {},
    i18n: {},
    slots: { 'global-overlay': [], 'right-drawer': [], toolbar: [] },
}));

/** A plugin field whose search input sits in a popover, portalled out of the form. */
function TagPicker(_props: BaseFieldProps): React.ReactElement {
    return (
        <Popover.Root>
            <Popover.Trigger>Tags</Popover.Trigger>
            <Popover.Portal>
                <Popover.Positioner>
                    <Popover.Popup>
                        <input aria-label="Search tags" />
                    </Popover.Popup>
                </Popover.Positioner>
            </Popover.Portal>
        </Popover.Root>
    );
}

fieldTypes['tag-picker'] = {
    plugin: 'tags',
    serviceKey: 'tags',
    namespace: 'tags',
    load: async () => ({ default: TagPicker }),
};

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

/** A `POST /setup` refusal in the API's error envelope. */
function refusal(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>
): Response {
    return json({ error: { id: 'e1', code, message, status, details } }, status);
}

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

    it('shows the user fields when a 422 names one the form left out', async () => {
        // The default passes the browser's check; a rule only the server runs refuses it.
        adminConfig.users.fields = [{ ...team, defaultValue: 'Ops' }];
        setupResponse = () =>
            refusal(422, 'VALIDATION_ERROR', 'Validation failed', {
                fields: { team: ['Team must be a real team'] },
            });
        const page = mountPage();

        await fillAccount(page);
        expect(screen.queryByLabelText(/Team/)).toBeNull();
        await page.user.click(screen.getByRole('button', { name: 'Create account' }));

        expect(await screen.findByLabelText(/Team/)).toBeDefined();
        expect(screen.getByText('Team must be a real team')).toBeDefined();
    });

    it('shows a 422 on an account key under its input, without the user fields', async () => {
        adminConfig.users.fields = [{ ...team, defaultValue: 'Ops' }];
        setupResponse = () =>
            refusal(422, 'VALIDATION_ERROR', 'Validation failed', {
                fields: { email: ['Must be a valid email address'] },
            });
        const page = mountPage();

        await fillAccount(page);
        await page.user.click(screen.getByRole('button', { name: 'Create account' }));

        const message = await screen.findByText('Must be a valid email address');
        expect(message.closest('.am-field')?.querySelector('input')).toBe(
            screen.getByLabelText('Email')
        );
        expect(screen.queryByLabelText(/Team/)).toBeNull();
    });

    it('names no account key in a toast when the 422 names only account keys', async () => {
        setupResponse = () =>
            refusal(422, 'VALIDATION_ERROR', 'Validation failed', {
                fields: { email: ['Must be a valid email address'] },
            });
        const page = mountPage();

        await fillAccount(page);
        await page.user.click(screen.getByRole('button', { name: 'Create account' }));

        await screen.findByText('Must be a valid email address');
        expect(screen.queryByText(/Please fix/)).toBeNull();
    });

    it('clears the error under an account input once it is edited', async () => {
        setupResponse = () =>
            refusal(422, 'VALIDATION_ERROR', 'Validation failed', {
                fields: { email: ['Must be a valid email address'] },
            });
        const page = mountPage();

        await fillAccount(page);
        await page.user.click(screen.getByRole('button', { name: 'Create account' }));
        await screen.findByText('Must be a valid email address');
        await page.user.type(screen.getByLabelText('Email'), 'u');

        expect(screen.queryByText('Must be a valid email address')).toBeNull();
    });

    it('leaves out an optional picker field, which works only after sign-in', async () => {
        adminConfig.users.fields = [
            team,
            { name: 'avatar', type: 'media', label: 'Avatar' },
        ];
        mountPage();

        expect(await screen.findByLabelText(/Team/)).toBeDefined();
        expect(screen.queryByText('Avatar')).toBeNull();
    });

    it('shows a closed sign-up inline', async () => {
        const closed = 'Sign-up is closed. Ask an administrator to create your account.';
        setupResponse = () => refusal(403, 'SIGN_UP_CLOSED', closed);
        const page = mountPage();

        await fillAccount(page);
        await page.user.click(screen.getByRole('button', { name: 'Create account' }));

        const message = await screen.findByText(closed);
        expect(message.className).toBe('am-auth-error');
        expect(page.location()).toBe('/setup');
    });

    it('submits on Enter in a user field', async () => {
        adminConfig.users.fields = [team];
        const page = mountPage();

        await fillAccount(page);
        await page.user.type(screen.getByLabelText(/Team/), 'Ops{Enter}');

        await waitFor(() =>
            expect(setupBody()).toMatchObject({ data: { fields: { team: 'Ops' } } })
        );
    });

    it('leaves Enter in a nested form to that form', async () => {
        adminConfig.users.fields = [
            team,
            { name: 'bio', type: 'richtext', label: 'Bio' },
        ];
        const page = mountPage();

        await fillAccount(page);
        await page.user.type(screen.getByLabelText(/Team/), 'Ops');
        await page.user.click(screen.getByRole('button', { name: 'Link' }));
        await page.user.type(
            screen.getByLabelText('Link URL'),
            'https://example.test{Enter}'
        );

        // The link form took the Enter: it applied the link and closed.
        await waitFor(() =>
            expect(screen.queryByRole('dialog', { name: 'Edit link' })).toBeNull()
        );
        expect(fetchMock.mock.calls.map(([url]) => String(url))).not.toContain(
            '/cms/api/setup'
        );
    });

    it('leaves Enter in a portalled popover to the popover', async () => {
        adminConfig.users.fields = [
            team,
            { name: 'tags', type: 'tag-picker', label: 'Tags' },
        ];
        const page = mountPage();
        await fillAccount(page);
        await page.user.type(screen.getByLabelText(/Team/), 'Ops');
        const submit = vi.fn();
        document.getElementById('am-setup-form')?.addEventListener('submit', submit);

        await page.user.click(await screen.findByRole('button', { name: 'Tags' }));
        await page.user.type(await screen.findByLabelText('Search tags'), 'news{Enter}');

        expect(submit).not.toHaveBeenCalled();
        expect(fetchMock.mock.calls.map(([url]) => String(url))).not.toContain(
            '/cms/api/setup'
        );
    });

    it('names a required picker field with no default instead of showing the form', async () => {
        adminConfig.users.fields = [
            { name: 'avatar', type: 'media', label: 'Avatar', required: true },
        ];
        mountPage();

        expect(
            await screen.findByText(
                'The required user field Avatar has no default, and its picker works only after sign-in. Give it a defaultValue in the config, or create the first admin with astromech users:create --fields.'
            )
        ).toBeDefined();
        expect(screen.queryByLabelText('Email')).toBeNull();
    });
});
