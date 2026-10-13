/**
 * @vitest-environment happy-dom
 *
 * The entries list's shown columns: local storage keeps the keys the user hid,
 * so a column the config adds later shows, and a hidden key that names no
 * column of the type any more is dropped rather than kept for good.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useVisibleColumns } from '@/admin/hooks/use-visible-columns';

const STORAGE_KEY = 'am-hidden-cols-post';

afterEach(() => {
    localStorage.clear();
});

function mount(adminColumns: { field: string }[], hasTitle = true) {
    return renderHook(() => useVisibleColumns('post', adminColumns, hasTitle));
}

function stored(): unknown {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? null : JSON.parse(raw);
}

describe('useVisibleColumns', () => {
    it('shows every system and admin column before the user hides one', () => {
        const { result } = mount([{ field: 'price' }]);

        expect([...result.current[0]]).toEqual([
            'title',
            'status',
            'slug',
            'locale',
            'translations',
            'updatedAt',
            'updatedBy',
            'fields.price',
        ]);
    });

    it('leaves the title out of a titleless type', () => {
        const { result } = mount([], false);

        expect(result.current[0].has('title')).toBe(false);
    });

    it('stores a hidden column and shows it again on a second toggle', () => {
        const { result } = mount([{ field: 'price' }]);

        act(() => result.current[1]('fields.price'));
        expect(result.current[0].has('fields.price')).toBe(false);
        expect(stored()).toEqual(['fields.price']);

        act(() => result.current[1]('fields.price'));
        expect(result.current[0].has('fields.price')).toBe(true);
        expect(stored()).toEqual([]);
    });

    it('shows a column the config adds after the user hid another', () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(['status']));

        const { result } = mount([{ field: 'price' }]);

        expect(result.current[0].has('status')).toBe(false);
        expect(result.current[0].has('fields.price')).toBe(true);
    });

    // A key from a removed column, or a bare field name from before field
    // columns were keyed by their path, names nothing the list can show.
    it('drops a stored key that names no column of the type', () => {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(['price', 'fields.gone', 'fields.price', 7])
        );

        const { result } = mount([{ field: 'price' }]);
        expect(result.current[0].has('fields.price')).toBe(false);

        act(() => result.current[1]('status'));
        expect(stored()).toEqual(['fields.price', 'status']);
    });

    it('shows every column when the stored value is unreadable', () => {
        localStorage.setItem(STORAGE_KEY, '{not json');

        const { result } = mount([{ field: 'price' }]);

        expect(result.current[0].size).toBe(8);
    });
});
