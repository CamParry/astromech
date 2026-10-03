import type { EntryStatus } from 'astromech';
import { isEntryStatus } from 'astromech/shared';

/** Map a badge column's value to a Badge variant, coloured like a status when it is one. */
export function statusVariant(status: string): EntryStatus | 'default' {
    return isEntryStatus(status) ? status : 'default';
}
