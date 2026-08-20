/**
 * @vitest-environment happy-dom
 *
 * The two fields that store a reference and fetch what it points at.
 *
 * Both hold state, so both are exposed to the seeding fact pinned in
 * `entry-form-field-seeding.test.tsx` — the field tree's first render sees an
 * empty `fields` record. They answer it differently: `media` re-runs its lookup
 * from an effect keyed on the value, and `relationship` derives its selection
 * from the prop and keeps only the fetched option list in state. Neither keeps
 * an author-editable copy, so neither needs the containers' re-seed guard.
 */

import type { Field } from '@/types/index';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import React from 'react';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/admin/components/ui/toast';
import '@/admin/rendering/register-fields';
import { FormField } from '@/admin/components/fields/form-field';

const { mediaGet, entriesQuery } = vi.hoisted(() => ({
    mediaGet: vi.fn(),
    entriesQuery: vi.fn(),
}));

vi.mock('@/transport/http/client/index', () => ({
    astromechClient: {
        media: { get: mediaGet, query: vi.fn() },
        entries: { query: entriesQuery },
    },
}));

vi.mock('virtual:astromech/admin-config', () => ({
    default: {
        defaultLocale: 'en',
        locales: ['en'],
        entries: { author: { titleField: 'title' } },
    },
}));

afterEach(cleanup);

beforeAll(async () => {
    await i18n.use(initReactI18next).init({
        lng: 'en',
        resources: { en: { translation: {} } },
    });
});

beforeEach(() => {
    mediaGet.mockReset();
    entriesQuery.mockReset();
});

type Mounted = {
    /** Every `onChange` the field has fired, oldest first. */
    commits: { name: string; value: unknown }[];
    /** Push a new value down, as the default-value copy landing would. */
    rerender: (value: unknown) => void;
    /** The value of the most recent commit. */
    last: () => unknown;
};

/** Mount one `FormField` whose value can be replaced after the first render. */
function mountField(field: Field, value: unknown): Mounted {
    const commits: { name: string; value: unknown }[] = [];
    let push!: (value: unknown) => void;

    function Holder(): React.ReactElement {
        const [current, setCurrent] = React.useState(value);
        push = setCurrent;
        return (
            <FormField
                field={field}
                value={current}
                onChange={(name, changed) => commits.push({ name, value: changed })}
            />
        );
    }

    render(
        <QueryClientProvider client={new QueryClient()}>
            <ToastProvider>
                <Holder />
            </ToastProvider>
        </QueryClientProvider>
    );

    return {
        commits,
        rerender: (next) => act(() => push(next)),
        last: () => commits.at(-1)?.value,
    };
}

/** Let the field's own fetch resolve. */
async function settle(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

function hidden(name: string): HTMLInputElement {
    const el = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
    if (el === null) throw new Error(`no hidden input named "${name}"`);
    return el;
}

describe('media on a fetched entry', () => {
    const cover: Field = { name: 'cover', type: 'media' };
    const gallery: Field = { name: 'gallery', type: 'media', multiple: true };

    function item(id: string, filename: string): Record<string, unknown> {
        return {
            id,
            url: `/media/${filename}`,
            filename,
            mimeType: 'image/png',
            size: 1024,
            alt: filename,
        };
    }

    it('looks the item up when the id arrives after the first render', async () => {
        mediaGet.mockImplementation(async ({ id }: { id: string }) =>
            item(id, `${id}.png`)
        );
        const f = mountField(cover, undefined);
        await settle();
        expect(mediaGet).not.toHaveBeenCalled();

        f.rerender('m1');
        await settle();

        expect(mediaGet).toHaveBeenCalledWith({ id: 'm1' });
        expect(hidden('cover').value).toBe('m1');
        expect(screen.getByAltText('m1.png')).toBeDefined();
    });

    it('commits null when the author clears the selection', async () => {
        const user = userEvent.setup();
        mediaGet.mockImplementation(async ({ id }: { id: string }) =>
            item(id, `${id}.png`)
        );
        const f = mountField(cover, undefined);
        f.rerender('m1');
        await settle();

        await user.click(screen.getByLabelText('fields.mediaRemoveLabel'));

        expect(f.commits.at(-1)).toEqual({ name: 'cover', value: null });
    });

    it('keeps the untouched ids when one of many is removed', async () => {
        const user = userEvent.setup();
        mediaGet.mockImplementation(async ({ id }: { id: string }) =>
            item(id, `${id}.png`)
        );
        const f = mountField(gallery, undefined);
        f.rerender(['m1', 'm2', 'm3']);
        await settle();

        const removeFirst = screen.getAllByLabelText('fields.mediaRemoveItemLabel')[0];
        if (removeFirst === undefined) throw new Error('no remove button rendered');
        await user.click(removeFirst);

        expect(f.last()).toEqual(['m2', 'm3']);
    });

    // The preview cannot draw without the item, but the stored id belongs to the
    // form, not to this component — a failed lookup must not write over it.
    it('reports the load failure and commits nothing', async () => {
        mediaGet.mockRejectedValue(new Error('gone'));
        const f = mountField(cover, undefined);

        f.rerender('m1');
        await settle();

        expect(screen.getByText('fields.mediaLoadFailed')).toBeDefined();
        expect(f.commits).toEqual([]);
    });
});

describe('relationship on a fetched entry', () => {
    const author: Field = { name: 'author', type: 'relationship', target: 'author' };

    const OPTIONS = [
        { id: 'a1', title: 'Ada Lovelace', slug: 'ada' },
        { id: 'a2', title: 'Grace Hopper', slug: 'grace' },
    ];

    /** A single-target relationship shows its selection in the combobox input. */
    function selectionLabel(): string {
        const el = document.querySelector<HTMLInputElement>(
            '.am-multiselect-single-input'
        );
        if (el === null) throw new Error('no combobox input rendered');
        return el.value;
    }

    it('labels the stored id once the option list lands', async () => {
        entriesQuery.mockResolvedValue({ data: OPTIONS });
        mountField(author, 'a1');
        await settle();

        expect(entriesQuery).toHaveBeenCalledWith({ type: 'author', limit: 'all' });
        expect(selectionLabel()).toBe('Ada Lovelace');
    });

    it('labels an id that arrives after the option list', async () => {
        entriesQuery.mockResolvedValue({ data: OPTIONS });
        const f = mountField(author, undefined);
        await settle();

        f.rerender('a2');

        expect(selectionLabel()).toBe('Grace Hopper');
    });

    it('commits the id of the entry the author picks', async () => {
        const user = userEvent.setup();
        entriesQuery.mockResolvedValue({ data: OPTIONS });
        const f = mountField(author, undefined);
        await settle();

        await user.click(document.querySelector('[role="combobox"]') as HTMLElement);
        const option = [...document.querySelectorAll('[role="option"]')].find((el) =>
            (el.textContent ?? '').includes('Grace Hopper')
        );
        if (option === undefined) throw new Error('the listbox has no "Grace Hopper"');
        await user.click(option);

        expect(f.commits.at(-1)).toEqual({ name: 'author', value: 'a2' });
    });

    // The label is only ever as good as the option list, but the stored id is
    // the form's — a failed lookup must not write over it.
    it('commits nothing when the lookup fails', async () => {
        entriesQuery.mockRejectedValue(new Error('offline'));
        const f = mountField(author, 'a1');
        await settle();

        expect(selectionLabel()).toBe('');
        expect(f.commits).toEqual([]);
    });
});
