/**
 * @vitest-environment happy-dom
 *
 * Selection is scoped to the active query: a selection carried into a narrower
 * filter points a bulk action at rows the user can no longer see.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useSelection } from '@/admin/hooks/use-selection';

afterEach(cleanup);

const PAGE_ONE = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const PAGE_TWO = [{ id: 'd' }, { id: 'e' }];

type Props = { items: { id: string }[]; scope: string };

/** Render the hook with the items and scope a list page would pass. */
function renderSelection(props: Props) {
    return renderHook(({ items, scope }: Props) => useSelection(items, scope), {
        initialProps: props,
    });
}

describe('useSelection', () => {
    it('tracks the ids toggled on', () => {
        const { result } = renderSelection({ items: PAGE_ONE, scope: 'q1' });

        act(() => result.current.toggle('a'));
        act(() => result.current.toggle('c'));

        expect([...result.current.checkedIds]).toEqual(['a', 'c']);
        expect(result.current.someChecked).toBe(true);
    });

    it('drops the selection when the scope changes', () => {
        const { result, rerender } = renderSelection({ items: PAGE_ONE, scope: 'q1' });
        act(() => result.current.toggle('a'));

        rerender({ items: PAGE_TWO, scope: 'q2' });

        expect(result.current.checkedIds.size).toBe(0);
        expect(result.current.someChecked).toBe(false);
    });

    it('keeps the selection while the scope holds', () => {
        const { result, rerender } = renderSelection({ items: PAGE_ONE, scope: 'q1' });
        act(() => result.current.toggle('b'));

        rerender({ items: [...PAGE_ONE], scope: 'q1' });

        expect([...result.current.checkedIds]).toEqual(['b']);
    });

    it('selects and clears every visible row through toggleAll', () => {
        const { result } = renderSelection({ items: PAGE_ONE, scope: 'q1' });

        act(() => result.current.toggleAll());
        expect(result.current.allChecked).toBe(true);

        act(() => result.current.toggleAll());
        expect(result.current.checkedIds.size).toBe(0);
    });
});
