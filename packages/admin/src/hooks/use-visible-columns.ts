/**
 * Which columns the entries list shows for one type. Local storage keeps the
 * keys the user hid, per type, so every system column and every admin column
 * shows until the user hides one, a column added to the config later included.
 * A stored key that names no column of the type any more is dropped on read.
 */

import { useState } from 'react';
import { fieldColumnKey } from '../rendering/resolve';

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
    const columns = columnKeys(adminColumns, hasTitle);
    const [hidden, setHidden] = useState(() => readHidden(type, columns));

    function toggle(key: string): void {
        setHidden((prev) => {
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

    return [new Set(columns.filter((key) => !hidden.has(key))), toggle];
}

function storageKey(type: string): string {
    return `am-hidden-cols-${type}`;
}

function columnKeys(adminColumns: { field: string }[], hasTitle: boolean): string[] {
    const system = hasTitle
        ? SYSTEM_COLUMNS
        : SYSTEM_COLUMNS.filter((c) => c !== 'title');
    return [...system, ...adminColumns.map((c) => fieldColumnKey(c.field))];
}

function readHidden(type: string, columns: string[]): Set<string> {
    try {
        const stored = localStorage.getItem(storageKey(type));
        const parsed: unknown = stored === null ? null : JSON.parse(stored);
        if (Array.isArray(parsed)) {
            return new Set(columns.filter((key) => parsed.includes(key)));
        }
    } catch {
        // A corrupt or unreadable entry falls back to showing every column.
    }
    return new Set();
}
