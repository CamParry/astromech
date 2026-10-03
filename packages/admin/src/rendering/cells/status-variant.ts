import type { EntryStatus } from 'astromech';
import { ENTRY_STATUSES } from 'astromech/shared';

/** Map a badge column's value to a Badge variant, coloured like a status when it is one. */
export function statusVariant(status: string): EntryStatus | 'default' {
    return isEntryStatus(status) ? status : 'default';
}

/** Whether a cell's value is one of the entry statuses. */
export function isEntryStatus(value: unknown): value is EntryStatus {
    return ENTRY_STATUSES.some((status) => status === value);
}
