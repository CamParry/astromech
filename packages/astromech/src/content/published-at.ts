/**
 * The one rule for the `publishedAt` an entry or global write stores. Every
 * write path that sets a status calls it; `DECISIONS.md` has the reasoning.
 */

import type { EntryStatus } from '@/types/index';
import { ValidationError } from '@/errors/validation';

/** What the rule reads: the write's status and date, and the row before it. */
type PublishedAtInput<S extends EntryStatus | undefined> = {
    /** The status the row has after the write, or undefined when the write sets none. */
    status: S;
    /** The date the caller sent, or undefined when it sent none. */
    given: Date | null | undefined;
    /** The row before the write; null when there is no row yet. */
    current: { status: EntryStatus; publishedAt: Date | null } | null;
    now: Date;
};

/**
 * The `publishedAt` a write stores: the caller's date, else by status (`published`
 * keeps a published row's date and stamps now on any other, `unpublished` clears,
 * `scheduled` keeps), else `undefined`. A row left scheduled with no date is a 422.
 */
export function resolvePublishedAt(input: PublishedAtInput<EntryStatus>): Date | null;
export function resolvePublishedAt(
    input: PublishedAtInput<EntryStatus | undefined>
): Date | null | undefined;
export function resolvePublishedAt(
    input: PublishedAtInput<EntryStatus | undefined>
): Date | null | undefined {
    const publishedAt = decidePublishedAt(input);
    // `schedule` requires the date; a scheduled row without one would never go live.
    if ((input.status ?? input.current?.status) === 'scheduled' && publishedAt === null) {
        throw ValidationError.fromFieldErrors({
            publishedAt: ['A scheduled status needs a publish date'],
        });
    }
    return publishedAt;
}

function decidePublishedAt(
    input: PublishedAtInput<EntryStatus | undefined>
): Date | null | undefined {
    const { status, given, current, now } = input;
    if (given !== undefined) return given;
    switch (status) {
        case 'published':
            return current?.status === 'published' ? current.publishedAt : now;
        case 'unpublished':
            return null;
        case 'scheduled':
            return current?.publishedAt ?? null;
        case undefined:
            return undefined;
    }
}
