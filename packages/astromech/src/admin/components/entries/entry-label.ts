/** Shared human label for an entry, used by the command palette and AI context. */

import type { AdminEntryType, Entry } from '@/types/index';

/**
 * Pick a human label for a live entry result. Entry types with
 * `titleField: false` (e.g. redirects) carry no `title`, so fall back to the
 * first non-empty searchable / column field value, then slug, then id.
 */
export function entryLabel(entry: Entry, entryType: AdminEntryType | undefined): string {
    if (typeof entry.title === 'string' && entry.title.trim() !== '') return entry.title;
    const keys = [
        ...(entryType?.search ?? []),
        ...(entryType?.adminColumns ?? []).map((c) => c.field),
    ];
    for (const key of keys) {
        const value = entry.fields?.[key];
        if (typeof value === 'string' && value.trim() !== '') return value;
    }
    return entry.slug ?? entry.id;
}
