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

import type { DataField } from '@/types/index';
import type { UserEvent } from '@testing-library/user-event';
import { act, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FormField } from '@/admin/components/fields/form-field';
import { renderWithProviders } from '../../_support/render-admin';

const { mediaGet, entriesQuery } = vi.hoisted(() => ({
    mediaGet: vi.fn(),
    entriesQuery: vi.fn(),
}));

vi.mock('astromech/fetch', () => ({
    astromechUntypedClient: {
        media: { get: mediaGet, query: vi.fn() },
        entries: { query: entriesQuery },
    },
}));

vi.mock('virtual:astromech/admin-config', () => ({
    default: {
        defaultLocale: 'en',
        locales: ['en'],
        entryTypes: { author: { titleField: 'title' } },
    },
}));

beforeEach(() => {
    mediaGet.mockReset();
    entriesQuery.mockReset();
});

type Mounted = {
    user: UserEvent;
    /** Every `onChange` the field has fired, oldest first. */
    commits: { name: string; value: unknown }[];
    /** Push a new value down, as the default-value copy landing would. */
    rerender: (value: unknown) => void;
    /** The value of the most recent commit. */
    last: () => unknown;
};

/** Mount one `FormField` whose value can be replaced after the first render. */
function mountField(field: DataField, value: unknown): Mounted {
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

    const { user } = renderWithProviders(<Holder />);

    return {
        user,
        commits,
        rerender: (next) => act(() => push(next)),
        last: () => commits.at(-1)?.value,
    };
}

/**
 * Await, inside `act`, the option lookup the field started on mount. Called
 * before any other await, so the field's own handler runs in the same scope.
 */
async function waitForOptions(): Promise<void> {
    const lookup = entriesQuery.mock.results.at(-1)?.value as
        | Promise<unknown>
        | undefined;
    if (lookup === undefined) throw new Error('the field never looked its options up');
    await act(async () => {
        await lookup.catch(() => undefined);
    });
}

function hidden(name: string): HTMLInputElement {
    const el = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
    if (el === null) throw new Error(`no hidden input named "${name}"`);
    return el;
}

describe('media on a fetched entry', () => {
    const cover: DataField = { name: 'cover', type: 'media' };
    const gallery: DataField = { name: 'gallery', type: 'media', multiple: true };

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
        // `render` flushes effects and the lookup is called from one, so a
        // lookup on mount would already be recorded.
        expect(mediaGet).not.toHaveBeenCalled();

        f.rerender('m1');

        expect(await screen.findByAltText('m1.png')).toBeDefined();
        expect(mediaGet).toHaveBeenCalledWith({ id: 'm1' });
        expect(hidden('cover').value).toBe('m1');
    });

    it('commits null when the author clears the selection', async () => {
        mediaGet.mockImplementation(async ({ id }: { id: string }) =>
            item(id, `${id}.png`)
        );
        const f = mountField(cover, undefined);
        f.rerender('m1');

        await f.user.click(await screen.findByRole('button', { name: 'Remove media' }));

        expect(f.commits.at(-1)).toEqual({ name: 'cover', value: null });
    });

    it('keeps the untouched ids when one of many is removed', async () => {
        mediaGet.mockImplementation(async ({ id }: { id: string }) =>
            item(id, `${id}.png`)
        );
        const f = mountField(gallery, undefined);
        f.rerender(['m1', 'm2', 'm3']);

        await f.user.click(await screen.findByRole('button', { name: 'Remove m1.png' }));

        expect(f.last()).toEqual(['m2', 'm3']);
    });

    // The preview cannot draw without the item, but the stored id belongs to the
    // form, not to this component — a failed lookup must not write over it.
    it('reports the load failure and commits nothing', async () => {
        mediaGet.mockRejectedValue(new Error('gone'));
        const f = mountField(cover, undefined);

        f.rerender('m1');

        expect(await screen.findByText('Failed to load media')).toBeDefined();
        expect(f.commits).toEqual([]);
    });
});

describe('relationship on a fetched entry', () => {
    const author: DataField = { name: 'author', type: 'relationship', target: 'author' };

    const OPTIONS = [
        { id: 'a1', title: 'Ada Lovelace', slug: 'ada' },
        { id: 'a2', title: 'Grace Hopper', slug: 'grace' },
    ];

    /** A single-target relationship shows its selection in the combobox input. */
    function selectionLabel(): string {
        return screen.getByRole<HTMLInputElement>('combobox').value;
    }

    it('labels the stored id once the option list lands', async () => {
        entriesQuery.mockResolvedValue({ data: OPTIONS });
        mountField(author, 'a1');
        await waitForOptions();

        expect(entriesQuery).toHaveBeenCalledWith({ type: 'author', limit: 'all' });
        expect(selectionLabel()).toBe('Ada Lovelace');
    });

    it('labels an id that arrives after the option list', async () => {
        entriesQuery.mockResolvedValue({ data: OPTIONS });
        const f = mountField(author, undefined);
        await waitForOptions();

        f.rerender('a2');

        expect(selectionLabel()).toBe('Grace Hopper');
    });

    it('commits the id of the entry the author picks', async () => {
        entriesQuery.mockResolvedValue({ data: OPTIONS });
        const f = mountField(author, undefined);
        await waitForOptions();

        await f.user.click(screen.getByRole('combobox'));
        await f.user.click(await screen.findByRole('option', { name: /Grace Hopper/ }));

        expect(f.commits.at(-1)).toEqual({ name: 'author', value: 'a2' });
    });

    // The label is only ever as good as the option list, but the stored id is
    // the form's — a failed lookup must not write over it.
    it('commits nothing when the lookup fails', async () => {
        entriesQuery.mockRejectedValue(new Error('offline'));
        const f = mountField(author, 'a1');
        await waitForOptions();

        expect(selectionLabel()).toBe('');
        expect(f.commits).toEqual([]);
    });
});
