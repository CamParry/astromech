/**
 * @vitest-environment happy-dom
 *
 * Seeding at the ENTRY FORM level, not the field level.
 *
 * An entry edit route fetches its entry, so `useEntryForm` is constructed with
 * `fields: {}` and TanStack copies the real `defaultValues` in from a LAYOUT
 * effect (`FormApi.update`). That effect runs after the render it belongs to,
 * and layout effects run child-before-parent — so the field tree's very first
 * render always sees `fields = {}`, whatever the entry holds. `A` below pins
 * that fact down; every other case here is a consequence of it.
 *
 * Any field that snapshots its value into `useState` on that first render is
 * therefore seeded from nothing, and then destroys the stored value the moment
 * the author touches it. That is why `useBlocksField`, `useTreeField` and
 * `RepeaterField` all carry a re-seed guard. `KeyValueEditor` does not.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { ToastProvider } from '@/admin/components/ui/toast';
import '@/admin/rendering/register-fields';
import { useEntryForm } from '@/admin/hooks/use-entry-form';
import type { UseEntryFormReturn } from '@/admin/hooks/use-entry-form';
import { EntryFieldColumn } from '@/admin/components/entries/entry-fields-renderer';
import type { Entry, Field } from '@/types/index';

afterEach(cleanup);

beforeAll(async () => {
    // The hook reads labels through `useTranslation`; the SPA's own i18n module
    // pulls in virtual modules, so stand up a bare instance instead.
    await i18n.use(initReactI18next).init({
        lng: 'en',
        resources: { en: { translation: {} } },
    });
});

/** The demo's `seoSection()`: a section wrapping an unboxed group. */
const SEO_GROUP: Field = {
    name: 'seo',
    type: 'group',
    boxed: false,
    fields: [
        { name: 'title', type: 'text', label: 'Meta title' },
        { name: 'description', type: 'textarea', label: 'Meta description' },
    ],
};

type MountOptions = {
    main: Field[];
    /** The demo's entry pages render TWO `form.Field name="fields"` columns. */
    sidebar?: Field[];
    fields: Record<string, unknown>;
};

type Harness = {
    handle: () => UseEntryFormReturn;
    saveFn: ReturnType<typeof vi.fn>;
    /** Deliver the fetched entry, as the query does. */
    load: () => void;
    /** `fields` as the column saw it, one snapshot per render, oldest first. */
    seen: unknown[];
};

/**
 * Mount the entry edit page's composition — `useEntryForm` above a field tree
 * that does not exist until the fetch lands (`entry-edit-page.tsx:300`).
 */
function mountEditPage({ main, sidebar = [], fields }: MountOptions): Harness {
    const saveFn = vi.fn(async () => ({ id: 'e1' }) as Entry);
    const publishFn = vi.fn(async () => ({ id: 'e1' }) as Entry);
    const seen: unknown[] = [];
    let latest: UseEntryFormReturn | undefined;
    let setEntry!: (entry: Entry | null) => void;

    function Probe(): React.ReactElement {
        const [entry, set] = React.useState<Entry | null>(null);
        setEntry = set;
        const result = useEntryForm({
            fieldDefinitions: [...main, ...sidebar],
            operation: 'update',
            namespace: 'translation',
            hasSlug: false,
            defaultValues: {
                title: entry?.title ?? '',
                slug: '',
                status: 'unpublished',
                publishedAt: '',
                fields: (entry?.fields as Record<string, unknown>) ?? {},
            },
            saveFn,
            publishFn,
        });
        latest = result;
        const { form } = result;

        if (entry === null) return <p>loading</p>;

        const column = (nodes: Field[], record: boolean): React.ReactElement => (
            <form.Field name="fields">
                {(f) => {
                    if (record) seen.push(structuredClone(f.state.value));
                    return (
                        <EntryFieldColumn
                            nodes={nodes}
                            values={f.state.value}
                            onChange={(name, value) =>
                                f.handleChange({ ...f.state.value, [name]: value })
                            }
                        />
                    );
                }}
            </form.Field>
        );

        return (
            <>
                {column(main, true)}
                {sidebar.length > 0 ? column(sidebar, false) : null}
            </>
        );
    }

    render(
        <QueryClientProvider client={new QueryClient()}>
            <ToastProvider>
                <Probe />
            </ToastProvider>
        </QueryClientProvider>
    );

    return {
        handle: () => {
            if (latest === undefined) throw new Error('the probe never rendered');
            return latest;
        },
        saveFn,
        seen,
        load: () =>
            act(() =>
                setEntry({ id: 'e1', title: 'A post', fields } as unknown as Entry)
            ),
    };
}

/** Let a submit (and the mutation it fires) settle. */
async function settle(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

function control(selector: string): HTMLElement {
    const el = document.querySelector<HTMLElement>(selector);
    if (el === null) {
        throw new Error(
            `no ${selector}; rendered: ${[...document.querySelectorAll('input, textarea')]
                .map((e) => e.getAttribute('name'))
                .join(', ')}`
        );
    }
    return el;
}

// ============================================================================
// A — the fact the rest of this file rests on
// ============================================================================

describe('the field tree and the TanStack default-value copy', () => {
    it('renders once against an empty `fields` before the copy lands', () => {
        const h = mountEditPage({
            main: [SEO_GROUP],
            fields: { seo: { title: 'Stored title', description: 'Stored description' } },
        });

        h.load();

        // The first snapshot is the whole bug surface: any field that reads its
        // value into `useState` here is seeded from nothing.
        expect(h.seen[0]).toEqual({});
        expect(h.seen.at(-1)).toEqual({
            seo: { title: 'Stored title', description: 'Stored description' },
        });
    });
});

// ============================================================================
// key-value — snapshots its pairs with no re-seed guard
// ============================================================================

describe('key-value on a fetched entry', () => {
    const META: Field = { name: 'meta', type: 'key-value', label: 'Meta' };

    it('renders the stored pairs', () => {
        const h = mountEditPage({
            main: [META],
            fields: { meta: { alpha: '1', beta: '2' } },
        });

        h.load();

        // `KeyValueEditor` seeds `useState(() => recordToPairs(value))` on the
        // first render, where `value` is still undefined — so the editor shows
        // an empty list for an entry that has two pairs.
        expect(document.querySelectorAll('.am-kv-editor-row')).toHaveLength(2);
        expect(h.handle().form.state.values.fields).toEqual({
            meta: { alpha: '1', beta: '2' },
        });
    });

    it('keeps the stored pairs when the author adds another', async () => {
        const user = userEvent.setup();
        const h = mountEditPage({
            main: [META],
            fields: { meta: { alpha: '1', beta: '2' } },
        });
        h.load();
        await settle();

        const add = [...document.querySelectorAll('button')].find((b) =>
            (b.textContent ?? '').toLowerCase().includes('add')
        );
        if (add === undefined) throw new Error('no add-pair button');
        await user.click(add);
        // The key input of the row just added — the LAST one, so the assertion
        // reads the same way whether or not the stored pairs were seeded.
        const rows = [...document.querySelectorAll('.am-kv-editor-row')];
        const newRow = rows.at(-1);
        if (newRow === undefined) throw new Error('no pair row was added');
        const keyInput = newRow.querySelector('input');
        if (keyInput === null) throw new Error('the added row has no key input');
        await user.type(keyInput, 'gamma');

        // The editor commits `pairsToRecord(pairs)` — its own local list — so an
        // unseeded list writes the new pair OVER the stored record.
        expect(h.handle().form.state.values.fields.meta).toEqual({
            alpha: '1',
            beta: '2',
            gamma: '',
        });
    });
});

// ============================================================================
// group — the stateless container, which the same race does NOT reach
// ============================================================================

describe('group on a fetched entry', () => {
    it('keeps the untouched sibling when one sub-field is edited', async () => {
        const user = userEvent.setup();
        const h = mountEditPage({
            main: [{ name: 'excerpt', type: 'textarea', label: 'Excerpt' }],
            sidebar: [SEO_GROUP],
            fields: {
                excerpt: 'An excerpt',
                seo: { title: 'Stored title', description: 'Stored description' },
            },
        });
        h.load();
        await settle();

        await user.clear(control('input[name="seo.title"]'));
        await user.type(control('input[name="seo.title"]'), 'Edited');

        expect(h.handle().form.state.values.fields.seo).toEqual({
            title: 'Edited',
            description: 'Stored description',
        });

        act(() => h.handle().handleSave());
        await settle();

        expect(h.saveFn.mock.calls[0]?.[0]).toMatchObject({
            fields: {
                excerpt: 'An excerpt',
                seo: { title: 'Edited', description: 'Stored description' },
            },
        });
    });
});
