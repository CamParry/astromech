/**
 * Version helpers every resource's write and restore share. A version snapshots
 * one content row, so the sequence runs per item and locale; which columns it
 * keeps beside `fields` is the resource spec's `versionedColumns`.
 */

import type { ContentRowId, ContentVersions } from './repository/types';
import type { ResourceSpec } from './resources';
import type { JsonObject, User } from '@/types/index';
import { transaction } from '@/database/transaction';
import { ResourceNotFoundError } from '@/errors/resource';
import { deepEqual } from '@/utilities/deep-equal';

/** A content row as the helpers read it: its row id, fields and own columns. */
type VersionedRecord = { contentId: ContentRowId; fields: JsonObject } & Record<
    string,
    unknown
>;

/** A stored version as the restore reads it. */
type StoredVersion = { contentId: string; fields: unknown } & Record<string, unknown>;

/**
 * Saves the content row's current state as its next version, credited to the
 * acting user. The caller decides whether a version is warranted; this numbers
 * and writes it. Outside a request (a CLI job, a seed script) there is no author.
 */
export async function snapshotVersion(
    spec: ResourceSpec,
    versions: ContentVersions<unknown>,
    record: VersionedRecord,
    /** Who the version is credited to; null outside a request. */
    user: User | null
): Promise<void> {
    const latestNumber = await versions.latestNumber(record.contentId);
    await versions.create({
        ...pick(record, spec.versionedColumns),
        contentId: record.contentId,
        version: latestNumber + 1,
        fields: record.fields,
        createdBy: user?.id ?? null,
    });
}

/**
 * True when an update changes something a version preserves: the fields, or one
 * of the spec's versioned columns (an entry's title and slug). An update
 * touching only `status` writes no version.
 */
export function changesVersionedContent(
    spec: ResourceSpec,
    current: { fields: JsonObject } & Record<string, unknown>,
    next: { fields?: JsonObject | undefined } & Record<string, unknown>
): boolean {
    for (const column of spec.versionedColumns) {
        if (next[column] !== undefined && next[column] !== current[column]) return true;
    }
    return next.fields !== undefined && !deepEqual(current.fields, next.fields);
}

/**
 * Restores one content row to a saved version. The version must snapshot this
 * row, else the call is not found. In one transaction it snapshots the row as it
 * stands, so a restore is itself reversible, then hands `write` the version's
 * fields and versioned columns; `write` updates the row and re-indexes it.
 */
export async function restoreVersion<R, V extends StoredVersion>(params: {
    spec: ResourceSpec;
    versions: ContentVersions<V>;
    current: VersionedRecord;
    versionId: string;
    /** The id (a global's key) and locale the call addressed, for the 404. */
    address: { id: string; locale: string };
    user: User | null;
    write: (restored: {
        fields: JsonObject;
        columns: Record<string, unknown>;
    }) => Promise<R>;
}): Promise<R> {
    const { spec, versions, current } = params;
    const version = await versions.get(params.versionId);
    if (!version || version.contentId !== current.contentId) {
        throw new ResourceNotFoundError(spec.kind, params.address);
    }
    const fields = ((version.fields as JsonObject | null) ??
        current.fields) as JsonObject;
    return transaction(async () => {
        await snapshotVersion(spec, versions, current, params.user);
        return params.write({ fields, columns: pick(version, spec.versionedColumns) });
    });
}

function pick(
    row: Record<string, unknown>,
    columns: readonly string[]
): Record<string, unknown> {
    return Object.fromEntries(columns.map((column) => [column, row[column]]));
}
