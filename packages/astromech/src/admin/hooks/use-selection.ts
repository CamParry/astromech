import { useState, useCallback } from 'react';

export type SelectionResult = {
    checkedIds: Set<string>;
    toggle: (id: string) => void;
    toggleAll: () => void;
    allChecked: boolean;
    someChecked: boolean;
    reset: () => void;
};

export function useSelection<T extends { id: string }>(items: T[]): SelectionResult {
    const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

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
