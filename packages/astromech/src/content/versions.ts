/**
 * Version helpers shared by the operations that write a version. A version
 * snapshots one content row, so the sequence runs per item and locale.
 */

import type { ContentRowId, ContentVersions } from './repository/types';
import type { JsonObject } from '@/types/index';
import { getCurrentUser } from '@/request-context/request-context';
import { deepEqual } from '@/utilities/deep-equal';

/**
 * Saves the content row's current state as its next version, credited to the
 * acting user. The caller decides whether a version is warranted; this numbers
 * and writes it, with the resource's own snapshot columns in `extra`. Outside a
 * request (a CLI job, a seed script) there is no author.
 */
export async function snapshotVersion(
    versions: ContentVersions<unknown>,
    record: { contentId: ContentRowId; fields: JsonObject },
    extra: Record<string, unknown> = {}
): Promise<void> {
    const latestNumber = await versions.latestNumber(record.contentId);
    const user = await getCurrentUser();
    await versions.create({
        ...extra,
        contentId: record.contentId,
        version: latestNumber + 1,
        fields: record.fields,
        createdBy: user?.id ?? null,
    });
}

/**
 * True when an update changes something a version preserves: the fields, or one
 * of the resource's own snapshot columns (entries' title and slug). An update
 * touching only `status` writes no version.
 */
export function changesVersionedContent(
    current: { fields: JsonObject } & Record<string, unknown>,
    next: { fields?: JsonObject | undefined } & Record<string, unknown>,
    columns: readonly string[] = []
): boolean {
    for (const column of columns) {
        if (next[column] !== undefined && next[column] !== current[column]) return true;
    }
    return next.fields !== undefined && !deepEqual(current.fields, next.fields);
}
