import { useState, useCallback, useRef } from 'react';

export type SelectionResult = {
    checkedIds: Set<string>;
    toggle: (id: string) => void;
    toggleAll: () => void;
    allChecked: boolean;
    someChecked: boolean;
    reset: () => void;
};

/**
 * Row selection for a list. Pass `scope` — a string identifying the active
 * query — to drop the selection whenever it changes: a selection made under
 * one filter must not survive into another, or a bulk action operates on rows
 * the user can no longer see.
 */
export function useSelection<T extends { id: string }>(
    items: T[],
    scope?: string
): SelectionResult {
    const [stored, setCheckedIds] = useState<Set<string>>(new Set());

    // Cleared during render, not in an effect, and the cleared value is what
    // this render returns — an effect would leave one render in which the bulk
    // bar still counts rows the new filter has hidden.
    const lastScope = useRef(scope);
    let checkedIds = stored;
    if (lastScope.current !== scope) {
        lastScope.current = scope;
        if (stored.size > 0) {
            checkedIds = new Set();
            setCheckedIds(checkedIds);
        }
    }

    const toggle = useCallback((id: string) => {
        setCheckedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const toggleAll = useCallback(() => {
        setCheckedIds((prev) => {
            const allSelected = items.length > 0 && items.every((i) => prev.has(i.id));
            return allSelected ? new Set() : new Set(items.map((i) => i.id));
        });
    }, [items]);

    const reset = useCallback(() => setCheckedIds(new Set()), []);

    const allChecked = items.length > 0 && items.every((i) => checkedIds.has(i.id));
    const someChecked = checkedIds.size > 0;

    return { checkedIds, toggle, toggleAll, allChecked, someChecked, reset };
}
