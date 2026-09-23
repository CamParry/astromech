/**
 * Which columns the entries list shows for one type, kept in local storage per
 * type. Every system column and every admin column shows until the user hides
 * one.
 */

import { useState } from 'react';

const SYSTEM_COLUMNS = [
    'title',
    'status',
    'slug',
    'locale',
    'translations',
    'updatedAt',
    'updatedBy',
] as const;

export function useVisibleColumns(
    type: string,
    adminColumns: { field: string }[],
    hasTitle: boolean
): [Set<string>, (key: string) => void] {
    const [visible, setVisible] = useState(() =>
        readColumns(type, adminColumns, hasTitle)
    );

    function toggle(key: string): void {
        setVisible((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            try {
                localStorage.setItem(storageKey(type), JSON.stringify([...next]));
            } catch {
                // Storage can be full or blocked; the choice lasts for the session.
            }
            return next;
        });
    }

    return [visible, toggle];
}

function storageKey(type: string): string {
    return `am-cols-${type}`;
}

function readColumns(
    type: string,
    adminColumns: { field: string }[],
    hasTitle: boolean
): Set<string> {
    try {
        const stored = localStorage.getItem(storageKey(type));
        const parsed: unknown = stored === null ? null : JSON.parse(stored);
        if (Array.isArray(parsed)) {
            const columns = new Set(parsed.filter((c) => typeof c === 'string'));
            if (!hasTitle) columns.delete('title');
            return columns;
        }
    } catch {
        // A corrupt or unreadable entry falls back to the defaults.
    }
    const system = hasTitle
        ? SYSTEM_COLUMNS
        : SYSTEM_COLUMNS.filter((c) => c !== 'title');
    return new Set([...system, ...adminColumns.map((c) => c.field)]);
}
