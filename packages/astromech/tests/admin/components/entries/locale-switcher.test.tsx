/**
 * @vitest-environment happy-dom
 *
 * The locale switcher. A resource keeps one address across its locales, so
 * switching is a change of the `locale` search param on the same id — never a
 * jump to a second row's id. A locale with no content row is written first, by
 * `update` on that locale, unless the caller passes `onSelectMissing` and takes
 * it over (which is what the global edit page does).
 */

import type { EntriesService, Entry } from '@/types/index';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    Outlet,
    RouterProvider,
} from '@tanstack/react-router';
import { cleanup, render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { LocaleSwitcher } from '@/admin/components/translations/locale-switcher';
import { ToastProvider } from '@/admin/components/ui/toast';

const TYPE = 'caseStudy';
const ID = 'cs1';
const BASE_PATH = `/entries/${TYPE}`;

afterEach(cleanup);

beforeAll(async () => {
    await i18n.use(initReactI18next).init({
        lng: 'en',
        resources: { en: { translation: {} } },
    });
});

function frEntry(): Entry {
    return {
        id: ID,
        type: TYPE,
        locale: 'fr',
        locales: ['en', 'fr'],
        title: 'Une étude de cas',
        fields: {},
    } as unknown as Entry;
}

/**
 * Mount the switcher under a real router, so the navigation it fires is
 * observable as a location rather than as a mock call.
 */
function mountSwitcher(options: {
    locales: string[];
    api: EntriesService;
    onSelectMissing?: (locale: string) => void;
}) {
    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const switcherRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => (
            <LocaleSwitcher
                id={ID}
                currentLocale="en"
                locales={options.locales}
                allLocales={['en', 'fr']}
                defaultLocale="en"
                basePath={BASE_PATH}
                type={TYPE}
                scope={{ api: options.api }}
                {...(options.onSelectMissing !== undefined
                    ? { onSelectMissing: options.onSelectMissing }
                    : {})}
                compact
            />
        ),
    });
    const router = createRouter({
        routeTree: rootRoute.addChildren([switcherRoute]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
    });

    render(
        <QueryClientProvider client={new QueryClient()}>
            <ToastProvider>
                <RouterProvider router={router} />
            </ToastProvider>
        </QueryClientProvider>
    );

    return router as unknown as { state: { location: { href: string } } };
}

/** Open the switcher's listbox and pick the option with this label. */
async function pick(label: string): Promise<void> {
    const user = userEvent.setup();
    // The router resolves its first match asynchronously.
    const trigger = await waitFor(() => {
        const found = document.querySelector('[role="combobox"]');
        if (found === null) throw new Error('the switcher rendered no trigger');
        return found;
    });
    await user.click(trigger);
    const option = [...document.querySelectorAll('[role="option"]')].find(
        (item) => item.textContent === label
    );
    if (option === undefined) {
        throw new Error(
            `no "${label}" option; rendered: ${[
                ...document.querySelectorAll('[role="option"]'),
            ]
                .map((item) => item.textContent)
                .join(', ')}`
        );
    }
    await user.click(option);
}

describe('the locale switcher', () => {
    it('keeps the id and changes the locale search param for an existing locale', async () => {
        const api = { update: vi.fn() } as unknown as EntriesService;
        const router = mountSwitcher({ locales: ['en', 'fr'], api });

        await pick('FR');

        await waitFor(() => {
            expect(router.state.location.href).toBe(`${BASE_PATH}/${ID}?locale=fr`);
        });
        // The row already exists, so nothing is written to reach it.
        expect(api.update).not.toHaveBeenCalled();
    });

    it('writes the missing locale through `update`, then opens it', async () => {
        const update = vi.fn<(params: Record<string, unknown>) => Promise<Entry>>(
            async () => frEntry()
        );
        const api = { update } as unknown as EntriesService;
        const router = mountSwitcher({ locales: ['en'], api });

        await pick('Add FR');

        await waitFor(() => {
            expect(update).toHaveBeenCalledTimes(1);
        });
        // An empty patch: the service inherits the shared fields itself.
        expect(update.mock.calls[0]?.[0]).toEqual({
            type: TYPE,
            id: ID,
            locale: 'fr',
            data: {},
        });
        await waitFor(() => {
            expect(router.state.location.href).toBe(`${BASE_PATH}/${ID}?locale=fr`);
        });
    });

    it('hands a missing locale to `onSelectMissing` instead of writing it', async () => {
        const update = vi.fn();
        const onSelectMissing = vi.fn();
        const api = { update } as unknown as EntriesService;
        mountSwitcher({ locales: ['en'], api, onSelectMissing });

        await pick('Add FR');

        await waitFor(() => {
            expect(onSelectMissing).toHaveBeenCalledWith('fr');
        });
        expect(update).not.toHaveBeenCalled();
    });
});
