/**
 * @vitest-environment happy-dom
 *
 * The user create page: a create sends the name, email, role and the declared
 * profile fields, toasts, then returns to the list; a 422 lands on the field it names
 * or in the banner, and the page stays put. A profile input is described by its error.
 */

import type { RenderAdminResult } from '../../_support/render-admin';
import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserNewPage } from '@/admin/components/users/user-new-page';
import { AstromechApiError } from '@/transport/http/client';
import { renderAdmin } from '../../_support/render-admin';

const { users, adminConfig } = vi.hoisted(() => ({
    users: { create: vi.fn<(params: unknown) => Promise<unknown>>() },
    adminConfig: {
        defaultLocale: 'en',
        locales: ['en'],
        roles: [{ slug: 'editor', name: 'Editor' }],
        users: {
            translatable: false,
            fields: [{ name: 'bio', type: 'text', label: 'Bio' }],
        },
    },
}));

vi.mock('virtual:astromech/admin-config', () => ({ default: adminConfig }));

// The page creates the user through the client; everything else is real.
vi.mock('astromech/fetch', async (importOriginal) => {
    const real = await importOriginal<{ astromechUntypedClient: object }>();
    return {
        ...real,
        astromechUntypedClient: { ...real.astromechUntypedClient, users },
    };
});

afterEach(() => {
    users.create.mockReset();
});

/** Mount the page at `/users/new`. */
function mountPage(): RenderAdminResult {
    return renderAdmin(<UserNewPage />, { url: '/users/new' });
}

function inputNamed(name: string): HTMLInputElement {
    const input = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
    if (input === null) throw new Error(`no input named "${name}"`);
    return input;
}

async function fillAndCreate(page: RenderAdminResult): Promise<void> {
    await page.user.type(await screen.findByLabelText('Name'), 'Ada Lovelace');
    await page.user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await page.user.type(inputNamed('bio'), 'Wrote the first program');
    await page.user.click(screen.getByRole('button', { name: 'Create' }));
}

function unprocessable(details: Record<string, unknown>): AstromechApiError {
    return new AstromechApiError({
        id: 'e1',
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        status: 422,
        details,
    });
}

describe('UserNewPage', () => {
    it('creates the user with its profile fields, says so and returns to the list', async () => {
        users.create.mockResolvedValue({ id: 'u1' });
        const page = mountPage();

        await fillAndCreate(page);

        await waitFor(() => expect(page.location()).toBe('/users'));
        expect(users.create).toHaveBeenCalledWith({
            data: {
                name: 'Ada Lovelace',
                email: 'ada@example.com',
                role: 'editor',
                fields: { bio: 'Wrote the first program' },
            },
        });
        expect(await screen.findByText('User created.')).not.toBeNull();
    });

    it('puts a 422 field error on the profile field it names', async () => {
        users.create.mockRejectedValue(unprocessable({ fields: { bio: ['Too long'] } }));
        const page = mountPage();

        await fillAndCreate(page);

        expect(await screen.findByText('Too long')).not.toBeNull();
        expect(inputNamed('bio').getAttribute('aria-invalid')).toBe('true');
        expect(page.location()).toBe('/users/new');
    });

    it('puts a 422 form error in the banner', async () => {
        users.create.mockRejectedValue(
            unprocessable({ form: ['A user with this email exists'] })
        );
        const page = mountPage();

        await fillAndCreate(page);

        const banner = await screen.findByRole('alert');
        expect(banner.textContent).toBe('A user with this email exists');
        expect(page.location()).toBe('/users/new');
    });

    it('describes a profile input by its error', async () => {
        const page = mountPage();

        const name = await screen.findByLabelText('Name');
        await page.user.type(name, 'A');
        await page.user.clear(name);

        const message = await screen.findByText('Name is required');
        expect(name.getAttribute('aria-invalid')).toBe('true');
        expect(name.getAttribute('aria-describedby')?.split(' ')).toContain(message.id);
    });
});
