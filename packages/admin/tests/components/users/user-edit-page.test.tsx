/**
 * @vitest-environment happy-dom
 *
 * The user edit page's locale switcher: a translatable config with more than
 * one locale offers it, choosing a locale the user has no row for shows the
 * fallback hint and sends that locale on save, and a non-translatable config
 * renders no switcher at all. A role picked for another user makes the form
 * dirty and is saved.
 */

import type { RenderAdminResult } from '../../_support/render-admin';
import type { User } from '@/types/index';
import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserEditPage } from '@/admin/components/users/user-edit-page';
import { renderAdmin } from '../../_support/render-admin';

const { users, adminConfig } = vi.hoisted(() => ({
    users: {
        get: vi.fn(),
        versions: vi.fn(),
        update: vi.fn(),
    },
    adminConfig: {
        defaultLocale: 'en',
        locales: ['en'],
        roles: [] as { slug: string; name: string }[],
        users: { translatable: false, fields: [] },
    },
}));

vi.mock('virtual:astromech/admin-config', () => ({ default: adminConfig }));

// The page reads and writes the user through the client; everything else is real.
vi.mock('astromech/fetch', async (importOriginal) => {
    const real = await importOriginal<{ astromechUntypedClient: object }>();
    return {
        ...real,
        astromechUntypedClient: { ...real.astromechUntypedClient, users },
    };
});

/** The locale the page last read the user in, so a fallback read can be faked. */
const requestedLocale = { current: undefined as string | undefined };

function makeUser(overrides: Partial<User> = {}): User {
    return {
        id: 'u1',
        email: 'user@example.com',
        name: 'Ada Lovelace',
        emailVerified: true,
        image: null,
        locale: 'en',
        locales: ['en'],
        fields: {},
        role: 'editor',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
        ...overrides,
    };
}

afterEach(() => {
    for (const fn of Object.values(users)) fn.mockReset();
    requestedLocale.current = undefined;
    adminConfig.locales = ['en'];
    adminConfig.users.translatable = false;
    adminConfig.roles = [];
});

/**
 * By default the signed-in user is the edited one: the role field is shown
 * only to someone else, and would add a second combobox the locale tests don't want.
 */
function mountPage(sessionId = 'u1'): RenderAdminResult {
    const user = makeUser();
    users.get.mockImplementation(async (params: { locale?: string }) => {
        requestedLocale.current = params.locale;
        return user;
    });
    users.versions.mockResolvedValue([]);
    users.update.mockResolvedValue(user);

    return renderAdmin(<UserEditPage id="u1" />, {
        url: '/users/u1',
        session: { id: sessionId },
    });
}

/**
 * Wait for the page body, read from its read-only email input. The locale
 * switcher renders in the same pass, so an absent one stays absent.
 */
async function findPage(): Promise<void> {
    await screen.findByDisplayValue('user@example.com');
}

/** Open the one listbox on the page and pick the option with this label. */
async function pickOption(page: RenderAdminResult, label: string): Promise<void> {
    await page.user.click(screen.getByRole('combobox'));
    await page.user.click(await screen.findByRole('option', { name: label }));
}

describe('UserEditPage locales', () => {
    it('renders no locale select when users are not translatable', async () => {
        mountPage();
        await findPage();

        expect(screen.queryByRole('combobox')).toBeNull();
    });

    it('renders no locale select with one configured locale even if translatable', async () => {
        adminConfig.users.translatable = true;
        mountPage();
        await findPage();

        expect(screen.queryByRole('combobox')).toBeNull();
    });

    it('offers a select when translatable and multiple locales are configured', async () => {
        adminConfig.users.translatable = true;
        adminConfig.locales = ['en', 'fr'];
        mountPage();

        expect(await screen.findByRole('combobox')).not.toBeNull();
    });

    it('reads the chosen locale, shows the fallback hint, and sends it on save', async () => {
        adminConfig.users.translatable = true;
        adminConfig.locales = ['en', 'fr'];
        const page = mountPage();
        await screen.findByRole('combobox');

        await pickOption(page, 'Add FR');

        expect(
            await screen.findByText('Showing the EN content until this locale is saved.')
        ).not.toBeNull();
        expect(requestedLocale.current).toBe('fr');

        await page.user.type(screen.getByLabelText('Name'), ' B');
        await page.user.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() =>
            expect(users.update).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'u1', locale: 'fr' })
            )
        );
    });
});

describe('UserEditPage role', () => {
    it('saves a role another user picks', async () => {
        adminConfig.roles = [
            { slug: 'editor', name: 'Editor' },
            { slug: 'admin', name: 'Admin' },
        ];
        const page = mountPage('someone-else');
        await findPage();

        const save = screen.getByRole('button', { name: 'Save' });
        expect((save as HTMLButtonElement).disabled).toBe(true);

        await pickOption(page, 'Admin');
        await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));

        await page.user.click(save);
        await waitFor(() =>
            expect(users.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'u1',
                    data: expect.objectContaining({ role: 'admin' }),
                })
            )
        );
    });
});
