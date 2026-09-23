/** A stored entry version in the public shape. */

import type { EntryVersionRow } from '../tables';
import type { EntryVersion, JsonObject } from '@/types/index';

/**
 * A stored version row in the public shape. The row names the content row it
 * snapshots, so the entry and locale come from the record it was read for.
 */
export function toEntryVersion(
    row: EntryVersionRow,
    record: { id: string; locale: string }
): EntryVersion {
    return {
        id: row.id,
        entryId: record.id,
        locale: record.locale,
        version: row.version,
        title: row.title,
        slug: row.slug,
        fields: (row.fields ?? null) as JsonObject | null,
        status: row.status,
        createdAt: row.createdAt,
        createdBy: row.createdBy,
    };
}
