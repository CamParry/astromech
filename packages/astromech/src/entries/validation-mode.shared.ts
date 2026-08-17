/**
 * How completely a write to an entry is validated.
 *
 * A scheduled entry goes live unattended, so it must be complete like a
 * published one. A type with statuses OFF has no draft concept — every row is
 * live, so it always validates completely; deriving from the (always
 * `'unpublished'`) stored status would silently disable `required` there.
 *
 * Pure leaf with no runtime imports: the admin (browser) imports it directly so
 * the client-side runner picks the same mode the server will.
 */

import type { EntryStatus, ValidationMode } from '@/types/index';

export function entryValidationMode(params: {
    status: EntryStatus | undefined;
    /** The type's resolved `statuses` capability. */
    hasStatuses: boolean;
}): ValidationMode {
    if (!params.hasStatuses) return 'complete';
    return params.status === 'published' || params.status === 'scheduled'
        ? 'complete'
        : 'partial';
}
