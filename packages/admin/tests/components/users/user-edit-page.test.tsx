/**
 * @vitest-environment happy-dom
 *
 * The user edit page's locale switcher: a translatable config with more than
 * one locale offers it, choosing a locale the user has no row for shows the
 * fallback hint and sends that locale on save, and a non-translatable config
 * renders no switcher at all. A role picked for another user makes the form
 * dirty and is saved.
 */

import type { AuthUser } from '@/admin/context/auth';
import type { User } from '@/types/index';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    Outlet,
    RouterProvider,
} from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '@/admin/components/ui/confirm';
import { ToastProvider } from '@/admin/components/ui/toast';
import { UserEditPage } from '@/admin/components/users/user-edit-page';
import { AiContextProvider } from '@/admin/context/ai-context';
import { AuthProvider, sessionQueryOptions } from '@/admin/context/auth';
import en from '@/admin/locales/en.json';

const { updateMutate, adminConfig } = vi.hoisted(() => ({
    updateMutate: vi.fn(),
    adminConfig: {
        defaultLocale: 'en',
        locales: ['en'],
        roles: [] as { slug: string; name: string }[],
        users: { translatable: false, fields: [] },
    },
}));

vi.mock('virtual:astromech/admin-config', () => ({ default: adminConfig }));

/** The locale `useUser` was asked for, so a fallback read can be faked. */
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

let user: User = makeUser();

vi.mock('@/admin/hooks/users', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useUser: (_id: string, locale?: string) => {
        requestedLocale.current = locale;
        return { data: user, isLoading: false };
    },
    useUserVersions: () => ({ data: [], isLoading: false }),
}));

/** `userMutations().update` answers with the user; every other row does nothing. */
vi.mock('@/admin/hooks/use-admin-mutation', () => ({
    useAdminMutation: (options: { mutationKey: readonly string[] }) => ({
        mutate: vi.fn(),
        mutateAsync: async (variables: unknown) => {
            if (options.mutationKey[1] === 'update') updateMutate(variables);
            return user;
        },
        isPending: false,
    }),
}));

beforeAll(async () => {
    await i18n.use(initReactI18next).init({
        lng: 'en',
        resources: { en: { translation: en } },
        interpolation: { escapeValue: false },
    });
});

afterEach(() => {
    updateMutate.mockReset();
    requestedLocale.current = undefined;
    adminConfig.locales = ['en'];
    adminConfig.users.translatable = false;
    adminConfig.roles = [];
    user = makeUser();
});

function makeClient(sessionId: string): QueryClient {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: false } },
    });
    queryClient.setQueryData<AuthUser>(sessionQueryOptions.queryKey, {
        id: sessionId,
        name: 'Ada Lovelace',
        email: 'user@example.com',
        image: null,
        role: 'admin',
        permissions: ['*'],
    });
    return queryClient;
}

/**
 * By default the signed-in user is the edited one: the role field is shown
 * only to someone else, and would add a second combobox the locale tests don't want.
 */
function mountPage(sessionId = 'u1'): void {
    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const editRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/users/$id',
        component: () => <UserEditPage id="u1" />,
    });
    const router = createRouter({
        routeTree: rootRoute.addChildren([editRoute]),
        history: createMemoryHistory({ initialEntries: ['/users/u1'] }),
    });

    render(
        <QueryClientProvider client={makeClient(sessionId)}>
            <ToastProvider>
                <AuthProvider>
                    <ConfirmProvider>
                        <AiContextProvider>
                            <RouterProvider router={router} />
                        </AiContextProvider>
                    </ConfirmProvider>
                </AuthProvider>
            </ToastProvider>
        </QueryClientProvider>
    );
}

/**
 * Wait for the page body, read from its read-only email input. The locale
 * switcher renders in the same pass, so an absent one stays absent.
 */
async function findPage(): Promise<void> {
    await screen.findByDisplayValue('user@example.com');
}

/** Open the one listbox on the page and pick the option with this label. */
async function pickOption(label: string): Promise<void> {
    const eventUser = userEvent.setup();
    const trigger = screen.getByRole('combobox');
    await eventUser.click(trigger);
    const option = [...document.querySelectorAll('[role="option"]')].find(
        (item) => item.textContent === label
    );
    if (option === undefined) {
        throw new Error(`no "${label}" option`);
    }
    await eventUser.click(option);
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
        mountPage();
        await screen.findByRole('combobox');

        await pickOption('Add FR');

        expect(
            await screen.findByText('Showing the EN content until this locale is saved.')
        ).not.toBeNull();
        expect(requestedLocale.current).toBe('fr');

        const eventUser = userEvent.setup();
        await eventUser.type(screen.getByLabelText('Name'), ' B');
        await eventUser.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() =>
            expect(updateMutate).toHaveBeenCalledWith(
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
        mountPage('someone-else');
        await findPage();

        const save = screen.getByRole('button', { name: 'Save' });
        expect((save as HTMLButtonElement).disabled).toBe(true);

        await pickOption('Admin');
        await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));

        await userEvent.setup().click(save);
        await waitFor(() =>
            expect(updateMutate).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'u1',
                    data: expect.objectContaining({ role: 'admin' }),
                })
            )
        );
    });
});
