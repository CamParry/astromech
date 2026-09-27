/**
 * Version helpers every resource's write, read and restore share. A version
 * snapshots one content row, so the sequence runs per item and locale, and a
 * version is addressed by the resource, the locale and its number. Which
 * columns it keeps beside `fields` is the resource's `versionedColumns`.
 */

import type { ContentRowId, ContentVersions } from './repository/types';
import type { JsonObject, ResourceType, User, VersionMetadata } from '@/types/index';
import { transaction } from '@/database/transaction';
import { ResourceNotFoundError } from '@/errors/resource';
import { deepEqual } from '@/utilities/deep-equal';
import { RESOURCE_SPECS } from './resources';

/** A content row as the helpers read it: its row id, fields and own columns. */
type VersionedRecord = { contentId: ContentRowId; fields: JsonObject } & Record<
    string,
    unknown
>;

/** A stored version as the read and the restore take it. */
type StoredVersion = {
    version: number;
    fields: unknown;
    createdAt: Date;
    createdBy: string | null;
} & Record<string, unknown>;

/** The content row a version call addressed, as the version helpers read it. */
type AddressedRecord = { contentId: ContentRowId; locale: string };

/** The id (a global's key) a call addressed, for the not-found error. */
type Address = { id: string };

/**
 * Every version of the addressed content row, newest first, as the metadata
 * `versions` answers. The version row names the content row it snapshots, so
 * the locale comes from the record it was read for.
 */
export async function listVersions(
    versions: ContentVersions<unknown>,
    record: AddressedRecord
): Promise<VersionMetadata[]> {
    const rows = await versions.findMany(record.contentId);
    return rows.map((row) => ({ ...row, locale: record.locale }));
}

/**
 * One version of the addressed content row: its metadata, and `snapshot`, the
 * fields and versioned columns it holds. A number the row has no version for
 * is not found. `S` is the snapshot's type as the method's output schema takes
 * it; that schema checks the value on the way out.
 */
export async function readVersion<S extends object>(params: {
    resource: ResourceType;
    versions: ContentVersions<StoredVersion>;
    record: AddressedRecord;
    version: number;
    address: Address;
}): Promise<VersionMetadata & { snapshot: S }> {
    const { resource, record } = params;
    const row = await findVersion(params.versions, record, params.version, {
        kind: resource,
        id: params.address.id,
    });
    const snapshot = {
        ...pick(row, RESOURCE_SPECS[resource].versionedColumns),
        fields: row.fields,
    };
    return {
        version: row.version,
        locale: record.locale,
        createdAt: row.createdAt,
        createdBy: row.createdBy,
        snapshot: snapshot as S,
    };
}

/**
 * Saves the content row's current state as its next version, credited to the
 * acting user. The caller decides whether a version is warranted; this numbers
 * and writes it. Outside a request (a CLI job, a seed script) there is no author.
 */
export async function snapshotVersion(
    resource: ResourceType,
    versions: ContentVersions<unknown>,
    record: VersionedRecord,
    /** Who the version is credited to; null outside a request. */
    user: User | null
): Promise<void> {
    const latestNumber = await versions.latestNumber(record.contentId);
    await versions.create({
        ...pick(record, RESOURCE_SPECS[resource].versionedColumns),
        contentId: record.contentId,
        version: latestNumber + 1,
        fields: record.fields,
        createdBy: user?.id ?? null,
    });
}

/**
 * True when an update changes something a version preserves: the fields, or one
 * of the resource's versioned columns (an entry's title and slug). An update
 * touching only `status` writes no version.
 */
export function changesVersionedContent(
    resource: ResourceType,
    current: { fields: JsonObject } & Record<string, unknown>,
    next: { fields?: JsonObject | undefined } & Record<string, unknown>
): boolean {
    for (const column of RESOURCE_SPECS[resource].versionedColumns) {
        if (next[column] !== undefined && next[column] !== current[column]) return true;
    }
    return next.fields !== undefined && !deepEqual(current.fields, next.fields);
}

/**
 * Restores one content row to a saved version, found by its number. A number
 * the row has no version for is not found. In one transaction it snapshots the
 * row as it stands, so a restore is itself reversible, then hands `write` the
 * version's fields and versioned columns; `write` updates the row and
 * re-indexes it.
 */
export async function restoreVersion<R, V extends StoredVersion>(params: {
    resource: ResourceType;
    versions: ContentVersions<V>;
    current: VersionedRecord & { locale: string };
    version: number;
    /** The id (a global's key) the call addressed, for the 404. */
    address: Address;
    user: User | null;
    write: (restored: {
        fields: JsonObject;
        columns: Record<string, unknown>;
    }) => Promise<R>;
}): Promise<R> {
    const { resource, versions, current } = params;
    const version = await findVersion(versions, current, params.version, {
        kind: resource,
        id: params.address.id,
    });
    const fields = (version.fields as JsonObject | null) ?? current.fields;
    const columns = pick(version, RESOURCE_SPECS[resource].versionedColumns);
    return transaction(async () => {
        await snapshotVersion(resource, versions, current, params.user);
        return params.write({ fields, columns });
    });
}

/** The addressed row's version with this number, or the not-found error. */
async function findVersion<V>(
    versions: ContentVersions<V>,
    record: AddressedRecord,
    version: number,
    error: { kind: ResourceType; id: string }
): Promise<V> {
    const row = await versions.findOne(record.contentId, version);
    if (row === null) {
        throw new ResourceNotFoundError(error.kind, {
            id: error.id,
            locale: record.locale,
            version,
        });
    }
    return row;
}

function pick(
    row: Record<string, unknown>,
    columns: readonly string[]
): Record<string, unknown> {
    return Object.fromEntries(columns.map((column) => [column, row[column]]));
}
