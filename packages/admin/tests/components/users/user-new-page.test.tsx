/**
 * @vitest-environment happy-dom
 *
 * The user create page: a create sends the name, email, role and the declared
 * profile fields, then returns to the list; a 422 lands on the field it names
 * or in the banner, and the page stays put.
 */

import type { AuthUser } from '@/admin/context/auth';
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
import '@/admin/rendering/register-fields';
import { ToastProvider } from '@/admin/components/ui/toast';
import { UserNewPage } from '@/admin/components/users/user-new-page';
import { AuthProvider, sessionQueryOptions } from '@/admin/context/auth';
import en from '@/admin/locales/en.json';
import { AstromechApiError } from '@/transport/http/client';

const { createUser, adminConfig } = vi.hoisted(() => ({
    createUser: vi.fn<(data: unknown) => Promise<unknown>>(),
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

/** `userMutations().create` runs `createUser`; every other row does nothing. */
vi.mock('@/admin/hooks/use-admin-mutation', () => ({
    useAdminMutation: (options: { mutationKey: readonly string[] }) => ({
        mutate: vi.fn(),
        mutateAsync: (variables: unknown) =>
            options.mutationKey[1] === 'create'
                ? createUser(variables)
                : Promise.resolve(undefined),
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
    createUser.mockReset();
});

function makeClient(): QueryClient {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: false } },
    });
    queryClient.setQueryData<AuthUser>(sessionQueryOptions.queryKey, {
        id: 'admin',
        name: 'Admin',
        email: 'admin@example.com',
        image: null,
        role: 'admin',
        permissions: ['*'],
    });
    return queryClient;
}

/** Mount the page at `/users/new`, beside a list route it can return to. */
function mountPage(): { path: () => string } {
    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const newRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/users/new',
        component: UserNewPage,
    });
    const listRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/users',
        component: () => <p>users list</p>,
    });
    const router = createRouter({
        routeTree: rootRoute.addChildren([newRoute, listRoute]),
        history: createMemoryHistory({ initialEntries: ['/users/new'] }),
    });

    render(
        <QueryClientProvider client={makeClient()}>
            <ToastProvider>
                <AuthProvider>
                    <RouterProvider router={router} />
                </AuthProvider>
            </ToastProvider>
        </QueryClientProvider>
    );
    return { path: () => router.state.location.pathname };
}

function inputNamed(name: string): HTMLInputElement {
    const input = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
    if (input === null) throw new Error(`no input named "${name}"`);
    return input;
}

async function fillAndCreate(): Promise<void> {
    const eventUser = userEvent.setup();
    await eventUser.type(await screen.findByLabelText('Name'), 'Ada Lovelace');
    await eventUser.type(screen.getByLabelText('Email'), 'ada@example.com');
    await eventUser.type(inputNamed('bio'), 'Wrote the first program');
    await eventUser.click(screen.getByRole('button', { name: 'Create' }));
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
    it('creates the user with its profile fields, then returns to the list', async () => {
        createUser.mockResolvedValue({ id: 'u1' });
        const page = mountPage();

        await fillAndCreate();

        await waitFor(() => expect(page.path()).toBe('/users'));
        expect(createUser).toHaveBeenCalledWith({
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            role: 'editor',
            fields: { bio: 'Wrote the first program' },
        });
    });

    it('puts a 422 field error on the profile field it names', async () => {
        createUser.mockRejectedValue(unprocessable({ fields: { bio: ['Too long'] } }));
        const page = mountPage();

        await fillAndCreate();

        expect(await screen.findByText('Too long')).not.toBeNull();
        expect(inputNamed('bio').getAttribute('aria-invalid')).toBe('true');
        expect(page.path()).toBe('/users/new');
    });

    it('puts a 422 form error in the banner', async () => {
        createUser.mockRejectedValue(
            unprocessable({ form: ['A user with this email exists'] })
        );
        const page = mountPage();

        await fillAndCreate();

        const banner = await screen.findByRole('alert');
        expect(banner.textContent).toBe('A user with this email exists');
        expect(page.path()).toBe('/users/new');
    });
});
