/**
 * Which validation stage a write to an entry runs at.
 *
 * A scheduled entry goes live unattended, so it must be complete like a
 * published one. A type with statuses OFF has no draft concept — every row is
 * live, so it always validates as a publish; deriving from the (always
 * `'unpublished'`) stored status would silently disable `required` there.
 *
 * Pure leaf with no runtime imports: the admin (browser) imports it directly so
 * the client-side runner picks the same stage the server will.
 */

import type { EntryStatus, ValidationStage } from '@/types/index';

export function entryValidationStage(params: {
    status: EntryStatus | undefined;
    /** The type's resolved `statuses` capability. */
    hasStatuses: boolean;
}): ValidationStage {
    if (!params.hasStatuses) return 'publish';
    return params.status === 'published' || params.status === 'scheduled'
        ? 'publish'
        : 'save';
}
