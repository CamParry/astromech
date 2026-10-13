/**
 * @vitest-environment happy-dom
 *
 * A value local storage keeps under a key. The entries list changes the key
 * while it stays mounted (a phone and a wider screen remember their views
 * apart), so a new key reads its own stored value, in the same render.
 */

import { act, renderHook } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLocalState } from '@/admin/hooks/use-local-state';

type View = 'list' | 'grid';

const VIEWS: readonly View[] = ['list', 'grid'];

afterEach(() => {
    localStorage.clear();
});

/** Mount the hook under `key`, recording each committed key and value. */
function mount(key: string) {
    const committed: [string, View][] = [];
    const hook = renderHook(
        ({ storageKey }: { storageKey: string }) => {
            const state = useLocalState<View>(storageKey, 'list', VIEWS);
            useEffect(() => {
                committed.push([storageKey, state[0]]);
            });
            return state;
        },
        { initialProps: { storageKey: key } }
    );
    return { ...hook, committed };
}

describe('useLocalState', () => {
    it('reads the stored value, or the default when none is stored', () => {
        localStorage.setItem('am:state:stored', 'grid');

        expect(mount('stored').result.current[0]).toBe('grid');
        expect(mount('unset').result.current[0]).toBe('list');
    });

    it('falls back to the default for a stored value it does not allow', () => {
        localStorage.setItem('am:state:view', 'table');

        expect(mount('view').result.current[0]).toBe('list');
    });

    it('falls back to the default when storage cannot be read', () => {
        // A blocked or unavailable storage throws on access.
        const getItem = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
            throw new DOMException('blocked', 'SecurityError');
        });
        try {
            expect(mount('view').result.current[0]).toBe('list');
        } finally {
            getItem.mockRestore();
        }
    });

    it('stores a set value under its key', () => {
        const { result } = mount('view');

        act(() => result.current[1]('grid'));

        expect(result.current[0]).toBe('grid');
        expect(localStorage.getItem('am:state:view')).toBe('grid');
    });

    it('reads the new key’s value when the key changes, without committing the old one', () => {
        localStorage.setItem('am:state:mobile', 'grid');
        const { result, rerender, committed } = mount('desktop');

        rerender({ storageKey: 'mobile' });

        expect(result.current[0]).toBe('grid');
        expect(committed).toEqual([
            ['desktop', 'list'],
            ['mobile', 'grid'],
        ]);
    });

    it('writes to the new key after the key changes', () => {
        const { result, rerender } = mount('desktop');
        rerender({ storageKey: 'mobile' });

        act(() => result.current[1]('grid'));

        expect(localStorage.getItem('am:state:mobile')).toBe('grid');
        expect(localStorage.getItem('am:state:desktop')).toBeNull();

        rerender({ storageKey: 'desktop' });
        expect(result.current[0]).toBe('list');
    });
});
