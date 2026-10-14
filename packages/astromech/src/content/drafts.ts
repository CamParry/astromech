/**
 * The draft rules entries and globals share: which writes go to a locale's
 * draft, and the time a draft save stamps
 * (`decisions/published-content-changes-through-a-draft.md`).
 */

import type { EntryStatus } from '@/types/index';

/**
 * Whether a type keeps drafts: it has statuses, so a locale can be published,
 * and does not turn `staging` on. Staging is the older way to hold pending
 * changes; the two never apply to one type, and staging is removed in a later
 * step (`roadmap/in-progress/drafts.md`).
 */
export function keepsDrafts(capabilities: {
    statuses: boolean;
    staging: boolean;
}): boolean {
    return capabilities.statuses && !capabilities.staging;
}

/**
 * Whether a write to a locale with this status goes to the locale's draft: it
 * is published, and the write changes content only. A write naming `status` or
 * `publishedAt` is a publish action, so it writes the live row and folds the
 * draft into it.
 */
export function writesDraft(
    status: EntryStatus,
    data: { status?: unknown; publishedAt?: unknown }
): boolean {
    return (
        status === 'published' &&
        data.status === undefined &&
        data.publishedAt === undefined
    );
}

/**
 * The `updatedAt` a draft save stamps: now, or one millisecond after the draft
 * it replaces when that is later. A save always moves the time, so a second
 * save from the same read, which names the old time in its guard, conflicts.
 */
export function draftSavedAt(replaced: Date | undefined): Date {
    const now = Date.now();
    if (replaced === undefined) return new Date(now);
    return new Date(Math.max(now, replaced.getTime() + 1));
}
