/**
 * The Snapshot model — a schema's DDL-affecting state, as plain data.
 *
 * A snapshot captures exactly what determines a table's shape on disk: column
 * storage type / nullability / primary-key / SQL default / enum values, foreign
 * keys, and indexes. Nothing else belongs in it — the differ treats any change
 * as a schema change, so caller-side facts that never reach the DDL (app-level
 * defaults, codecs, …) must be excluded or every such edit would generate a
 * spurious migration.
 *
 * The wire format is stable: `serializeSnapshot` is a plain
 * `JSON.stringify(snapshot, null, 2)` over data the caller supplies in the
 * order it wants preserved (tables keyed by name, columns and indexes in
 * declaration order — the source of a rebuild's column mapping). There is no
 * `id`/`prevId` chain: divergent parallel generation runs surface as a snapshot
 * merge conflict rather than a silent hash mismatch.
 */

export type SqlDialect = 'sqlite';

export type SnapshotColumn = {
    /** Opaque caller tag (e.g. the source field key). Equality-compared — a
     *  change forces a rebuild — but never interpreted by the engine. */
    key?: string;
    name: string;
    /** Opaque caller tag (e.g. the source column kind). Equality-compared — a
     *  change forces a rebuild — but never interpreted by the engine. */
    kind?: string;
    type: 'text' | 'integer' | 'real';
    notNull: boolean;
    primaryKey: boolean;
    default?: string | number;
    enumValues?: readonly string[];
};

export type SnapshotForeignKey = {
    column: string;
    targetTable: string;
    targetColumn: string;
    onDelete: string;
};

export type SnapshotIndex = {
    name: string;
    columns: string[];
    unique: boolean;
    where?: string;
};

export type SnapshotTable = {
    name: string;
    columns: SnapshotColumn[];
    fks: SnapshotForeignKey[];
    indexes: SnapshotIndex[];
};

export type Snapshot = {
    version: 1;
    dialect: SqlDialect;
    tables: Record<string, SnapshotTable>;
};

/** Stable JSON rendering of a snapshot (same input → identical output). */
export function serializeSnapshot(snapshot: Snapshot): string {
    return JSON.stringify(snapshot, null, 2);
}
