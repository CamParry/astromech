/**
 * Entry version helpers shared by the operations that write or read a version.
 * A version snapshots one content row, so the sequence runs per entry and locale.
 */

import type { EntryRepository } from '../repository/types';
import type { EntryVersionRow } from '../tables';
import type { EntryRecord } from './records';
import type { EntryVersion, JsonObject } from '@/types/index';
import { getCurrentUser } from '@/request-context/request-context';
import { deepEqual } from './deep-equal';

/**
 * Saves the entry locale's current state as its next version, credited to the
 * acting user. The caller decides whether a version is warranted; this numbers
 * and writes it. Outside a request (a CLI job, a seed script) there is no author.
 */
export async function snapshotVersion(
    versions: NonNullable<EntryRepository['versions']>,
    record: EntryRecord
): Promise<void> {
    const latestNumber = await versions.latestNumber(record.contentId);
    const user = await getCurrentUser();
    await versions.create({
        contentId: record.contentId,
        version: latestNumber + 1,
        title: record.title,
        slug: record.slug,
        fields: record.fields,
        createdBy: user?.id ?? null,
    });
}

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

/**
 * True when an update changes something a version preserves: the title, the
 * slug or the fields. An update touching only `status` writes no version.
 */
export function changesVersionedContent(
    current: { title: string; slug: string | null; fields: JsonObject },
    next: {
        title?: string | undefined;
        slug?: string | undefined;
        fields?: JsonObject | undefined;
    }
): boolean {
    if (next.title !== undefined && next.title !== current.title) return true;
    if (next.slug !== undefined && next.slug !== current.slug) return true;
    return next.fields !== undefined && !deepEqual(current.fields, next.fields);
}
