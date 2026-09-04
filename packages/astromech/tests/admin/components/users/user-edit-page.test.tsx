/**
 * @vitest-environment happy-dom
 *
 * The user edit page's locale switcher: a translatable config with more than
 * one locale offers it, choosing a locale the user has no row for shows the
 * fallback hint and sends that locale on save, and a non-translatable config
 * renders no switcher at all.
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
import { act, cleanup, render, screen } from '@testing-library/react';
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

const { updateMutate, updateOptions, adminConfig } = vi.hoisted(() => ({
    updateMutate: vi.fn(),
    // The locale reaches the service through the hook's options, not `mutate`.
    updateOptions: { current: undefined as { locale?: string } | undefined },
    adminConfig: {
        defaultLocale: 'en',
        locales: ['en'],
        roles: [],
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

vi.mock('@/admin/hooks/users', () => ({
    useUser: (_id: string, locale?: string) => {
        requestedLocale.current = locale;
        return { data: user, isLoading: false };
    },
    useUpdateUser: (_id: string, options?: { locale?: string }) => {
        updateOptions.current = options;
        return {
            mutate: updateMutate,
            mutateAsync: async (data: unknown) => {
                updateMutate(data);
                return user;
            },
            isPending: false,
        };
    },
    useDeleteUser: () => ({ mutate: vi.fn(), isPending: false }),
    useUserVersions: () => ({ data: [], isLoading: false }),
    useRestoreUserVersion: () => ({ mutate: vi.fn(), isPending: false }),
}));

beforeAll(async () => {
    await i18n.use(initReactI18next).init({
        lng: 'en',
        resources: { en: { translation: en } },
        interpolation: { escapeValue: false },
    });
});

afterEach(() => {
    cleanup();
    updateMutate.mockReset();
    updateOptions.current = undefined;
    requestedLocale.current = undefined;
    adminConfig.locales = ['en'];
    adminConfig.users.translatable = false;
    user = makeUser();
});

function makeClient(): QueryClient {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: false } },
    });
    // The same id as the edited user: the role field is account-editor-only
    // and would add a second combobox the locale-select tests don't want.
    queryClient.setQueryData<AuthUser>(sessionQueryOptions.queryKey, {
        id: 'u1',
        name: 'Ada Lovelace',
        email: 'user@example.com',
        image: null,
        role: 'admin',
        permissions: ['*'],
    });
    return queryClient;
}

function mountPage(): void {
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
        <QueryClientProvider client={makeClient()}>
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

async function settle(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

/** Open the locale listbox and pick the option with this label. */
async function pickLocale(label: string): Promise<void> {
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
        await settle();

        expect(screen.queryByRole('combobox')).toBeNull();
    });

    it('renders no locale select with one configured locale even if translatable', async () => {
        adminConfig.users.translatable = true;
        mountPage();
        await settle();

        expect(screen.queryByRole('combobox')).toBeNull();
    });

    it('offers a select when translatable and multiple locales are configured', async () => {
        adminConfig.users.translatable = true;
        adminConfig.locales = ['en', 'fr'];
        mountPage();
        await settle();

        expect(screen.getByRole('combobox')).not.toBeNull();
    });

    it('reads the chosen locale, shows the fallback hint, and sends it on save', async () => {
        adminConfig.users.translatable = true;
        adminConfig.locales = ['en', 'fr'];
        mountPage();
        await settle();

        await pickLocale('Add FR');
        await settle();

        expect(requestedLocale.current).toBe('fr');
        expect(
            screen.getByText('Showing the EN content until this locale is saved.')
        ).not.toBeNull();
        expect(updateOptions.current?.locale).toBe('fr');
    });
});
