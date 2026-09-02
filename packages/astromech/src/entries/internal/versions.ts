/**
 * Entry version helpers shared by the operations that write or read a version.
 * A version snapshots one content row, so the sequence runs per entry and
 * locale. The numbering and the change test are `content/`'s; entries adds its
 * own snapshot columns (`title`, `slug`) and the public row shape.
 */

import type { EntryRepository } from '../repository/types';
import type { EntryVersionRow } from '../tables';
import type { EntryRecord } from './records';
import type { EntryVersion, JsonObject } from '@/types/index';
import {
    changesVersionedContent as changesContent,
    snapshotVersion as snapshotContentVersion,
} from '@/content/versions';

/** The entry columns a version snapshots beyond `fields`. */
const VERSIONED_COLUMNS = ['title', 'slug'] as const;

/**
 * Saves the entry locale's current state as its next version, credited to the
 * acting user. The caller decides whether a version is warranted; this numbers
 * and writes it. Outside a request (a CLI job, a seed script) there is no author.
 */
export async function snapshotVersion(
    versions: NonNullable<EntryRepository['versions']>,
    record: EntryRecord
): Promise<void> {
    await snapshotContentVersion(versions, record, {
        title: record.title,
        slug: record.slug,
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
    return changesContent(current, next, VERSIONED_COLUMNS);
}
