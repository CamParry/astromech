/**
 * The one rule for the `publishedAt` an entry or global write stores. Every
 * write path that sets a status calls it; `DECISIONS.md` has the reasoning.
 */

import type { EntryStatus } from '@/types/index';

/** What the rule reads: the write's status and date, and the row's date before it. */
type PublishedAtInput<S extends EntryStatus | undefined> = {
    /** The status the row has after the write, or undefined when the write sets none. */
    status: S;
    /** The date the caller sent, or undefined when it sent none. */
    given: Date | null | undefined;
    /** The row's date before the write; null when there is no row yet. */
    current: Date | null;
    now: Date;
};

/**
 * The `publishedAt` a write stores: the caller's date as given, else by the
 * status after the write (`published` keeps a past date or takes now,
 * `unpublished` clears, `scheduled` keeps), else `undefined`, leaving it alone.
 */
export function resolvePublishedAt(input: PublishedAtInput<EntryStatus>): Date | null;
export function resolvePublishedAt(
    input: PublishedAtInput<EntryStatus | undefined>
): Date | null | undefined;
export function resolvePublishedAt(
    input: PublishedAtInput<EntryStatus | undefined>
): Date | null | undefined {
    const { status, given, current, now } = input;
    if (given !== undefined) return given;
    switch (status) {
        case 'published':
            return current !== null && current.getTime() <= now.getTime() ? current : now;
        case 'unpublished':
            return null;
        case 'scheduled':
            return current;
        case undefined:
            return undefined;
    }
}
