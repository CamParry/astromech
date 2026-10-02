/**
 * @vitest-environment happy-dom
 *
 * The locale switcher. A resource keeps one address across its locales, so
 * switching is a change of the `locale` search param on the same id — never a
 * jump to a second row's id. A locale with no content row is written first, by
 * `update` on that locale, unless the caller passes `onSelectMissing` and takes
 * it over (which is what the global edit page does).
 */

import type { RenderAdminResult } from '../../_support/render-admin';
import type { EntriesService, Entry } from '@/types/index';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleSwitcher } from '@/admin/components/translations/locale-switcher';
import { renderAdmin } from '../../_support/render-admin';

// The page calls entries through the client; each test sets the stub.
const client = vi.hoisted(() => ({ entries: undefined as unknown }));

vi.mock('astromech/fetch', async (importOriginal) => {
    const real = await importOriginal<{ astromechUntypedClient: object }>();
    return {
        ...real,
        astromechUntypedClient: {
            ...real.astromechUntypedClient,
            get entries() {
                return client.entries;
            },
        },
    };
});

const TYPE = 'caseStudy';
const ID = 'cs1';
const BASE_PATH = `/entries/${TYPE}`;

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
    client.entries = options.api;

    return renderAdmin(
        <LocaleSwitcher
            id={ID}
            currentLocale="en"
            locales={options.locales}
            allLocales={['en', 'fr']}
            defaultLocale="en"
            basePath={BASE_PATH}
            type={TYPE}
            {...(options.onSelectMissing !== undefined
                ? { onSelectMissing: options.onSelectMissing }
                : {})}
            compact
        />
    );
}

/** Open the switcher's listbox and pick the option with this label. */
async function pick(view: RenderAdminResult, label: string): Promise<void> {
    // The router resolves its first match asynchronously.
    await view.user.click(await screen.findByRole('combobox'));
    await view.user.click(await screen.findByRole('option', { name: label }));
}

describe('the locale switcher', () => {
    it('keeps the id and changes the locale search param for an existing locale', async () => {
        const api = { update: vi.fn() } as unknown as EntriesService;
        const view = mountSwitcher({ locales: ['en', 'fr'], api });

        await pick(view, 'FR');

        await waitFor(() => {
            expect(view.location()).toBe(`${BASE_PATH}/${ID}?locale=fr`);
        });
        // The row already exists, so nothing is written to reach it.
        expect(api.update).not.toHaveBeenCalled();
    });

    it('writes the missing locale through `update`, then opens it', async () => {
        const update = vi.fn<(params: Record<string, unknown>) => Promise<Entry>>(
            async () => frEntry()
        );
        const api = { update } as unknown as EntriesService;
        const view = mountSwitcher({ locales: ['en'], api });

        await pick(view, 'Add FR');

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
            expect(view.location()).toBe(`${BASE_PATH}/${ID}?locale=fr`);
        });
    });

    it('hands a missing locale to `onSelectMissing` instead of writing it', async () => {
        const update = vi.fn();
        const onSelectMissing = vi.fn();
        const api = { update } as unknown as EntriesService;
        const view = mountSwitcher({ locales: ['en'], api, onSelectMissing });

        await pick(view, 'Add FR');

        await waitFor(() => {
            expect(onSelectMissing).toHaveBeenCalledWith('fr');
        });
        expect(update).not.toHaveBeenCalled();
    });
});
