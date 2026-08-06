/**
 * @vitest-environment happy-dom
 *
 * A save on the entry edit page must write through to the query cache.
 *
 * `useEntryForm`'s save/publish `onSuccess` calls `form.reset(form.state.values)`,
 * which drops `isTouched` back to `false`. `@tanstack/react-form`'s `useForm`
 * copies `options.defaultValues` into `state.values` on every render when they
 * differ from the previous options and the form isn't touched — and
 * `entry-edit-page.tsx` rebuilds `defaultValues` fresh from `useEntry(...)`'s
 * cached entry on every render. If nothing seeds that cache with the saved
 * entry, the next render (which the mutation settling itself triggers) copies
 * the STALE cached entry back over the just-saved values.
 *
 * This does not mount the full `EntryEditPage` — that needs a router context,
 * `useConfirm`, and other providers this suite has no existing pattern for.
 * Instead it recreates the page's exact hook composition (`useEntry` +
 * `useEntryForm`, wired the same way `entry-edit-page.tsx` wires them,
 * including its `onSuccess`), the same approach `entry-form-field-seeding.test.tsx`
 * already uses for this file's neighbourhood.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { ToastProvider } from '@/admin/components/ui/toast';
import { useEntry } from '@/admin/hooks/entries.js';
import { useEntryForm } from '@/admin/hooks/use-entry-form.js';
import { scopedEntryKeys } from '@/admin/hooks/use-query-keys.js';
import type { Entry, EntriesService, EntryStatus } from '@/types/index.js';

afterEach(cleanup);

beforeAll(async () => {
    // The hook reads labels through `useTranslation`; the SPA's own i18n module
    // pulls in virtual modules, so stand up a bare instance instead.
    await i18n.use(initReactI18next).init({
        lng: 'en',
        resources: { en: { translation: {} } },
    });
});

const TYPE = 'caseStudy';
const ID = 'cs1';

function makeEntry(customer: string): Entry {
    return {
        id: ID,
        type: TYPE,
        title: 'A case study',
        status: 'published' as EntryStatus,
        fields: { customer },
    } as unknown as Entry;
}

/**
 * Mounts `useEntry` + `useEntryForm` wired the same way `entry-edit-page.tsx`
 * wires them: `defaultValues` rebuilt fresh from the cached entry each render,
 * and `onSuccess` seeding the cache before invalidating it.
 */
function mountEditPage(queryClient: QueryClient) {
    const keys = scopedEntryKeys('');
    const update = vi.fn(async (params: { data: { fields?: Record<string, unknown> } }) =>
        makeEntry((params.data.fields?.['customer'] as string) ?? '')
    );
    const api = {
        get: vi.fn(async () => queryClient.getQueryData(keys.get(TYPE, ID)) ?? null),
        update,
    } as unknown as EntriesService;

    let handleSave: (() => void) | undefined;

    function Probe(): React.ReactElement {
        const { data: entry } = useEntry(TYPE, ID, { api, cacheScope: '' });
        const result = useEntryForm({
            fieldDefinitions: [{ name: 'customer', type: 'text', label: 'Customer' }],
            operation: 'update',
            namespace: 'translation',
            hasSlug: false,
            defaultValues: {
                title: entry?.title ?? '',
                slug: '',
                status: entry?.status ?? ('unpublished' as EntryStatus),
                publishAt: '',
                fields: (entry?.fields as Record<string, unknown>) ?? {},
            },
            saveFn: (data) => api.update({ type: TYPE, id: ID, data }),
            publishFn: (data) => api.update({ type: TYPE, id: ID, data }),
            onSuccess: (updated) => {
                // Mirrors entry-edit-page.tsx: seed the cache with the saved
                // entry BEFORE invalidating, so the re-render `form.reset`
                // triggers already sees fresh defaultValues.
                queryClient.setQueryData(keys.get(TYPE, ID), updated);
                void queryClient.invalidateQueries({ queryKey: keys.all(TYPE) });
            },
        });
        handleSave = result.handleSave;
        const { form } = result;

        if (entry == null) return <p>loading</p>;

        return (
            <form.Field name="fields">
                {(f) => (
                    <input
                        aria-label="Customer"
                        value={
                            ((f.state.value as Record<string, unknown>)['customer'] as
                                | string
                                | undefined) ?? ''
                        }
                        onChange={(e) =>
                            f.handleChange({
                                ...(f.state.value as Record<string, unknown>),
                                customer: e.target.value,
                            })
                        }
                    />
                )}
            </form.Field>
        );
    }

    render(
        <QueryClientProvider client={queryClient}>
            <ToastProvider>
                <Probe />
            </ToastProvider>
        </QueryClientProvider>
    );

    return {
        update,
        save: () => {
            if (handleSave === undefined) throw new Error('the probe never rendered');
            handleSave();
        },
    };
}

/** Let a submit (and the mutation it fires) settle. */
async function settle(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

describe('the entry edit page after a save', () => {
    it('keeps displaying the just-saved value, not the stale cached one', async () => {
        const user = userEvent.setup();
        // The admin app's real staleTime (admin/main.tsx) — nothing refetches
        // this query on its own in the observation window.
        const queryClient = new QueryClient({
            defaultOptions: { queries: { staleTime: 30_000 } },
        });
        const keys = scopedEntryKeys('');
        queryClient.setQueryData(keys.get(TYPE, ID), makeEntry('Lumenflow'));

        const page = mountEditPage(queryClient);

        const input = (await screen.findByLabelText('Customer')) as HTMLInputElement;
        expect(input.value).toBe('Lumenflow');

        // First edit + save.
        await user.clear(input);
        await user.type(input, 'Lumenflow International');
        act(() => page.save());
        await settle();

        expect(page.update).toHaveBeenCalledTimes(1);
        expect(input.value).toBe('Lumenflow International');

        // A second render tick — the same kind `form.reset` triggers — must
        // not copy a stale cached value back over the display.
        await settle();
        expect(input.value).toBe('Lumenflow International');

        // Second edit + save: this is the case the live bug regressed on —
        // the display went back to the ORIGINAL value, not the prior save.
        await user.clear(input);
        await user.type(input, 'Zephyr Labs');
        act(() => page.save());
        await settle();

        expect(page.update).toHaveBeenCalledTimes(2);
        expect(input.value).toBe('Zephyr Labs');

        await settle();
        expect(input.value).toBe('Zephyr Labs');
    });
});
