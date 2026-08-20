/**
 * The Snapshot model — a schema's DDL-affecting state, as plain data. Captures
 * exactly what determines a table's shape on disk; nothing else belongs in it,
 * since the differ treats any change as a schema change.
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
    /** Table-level composite primary key, in key order. Omitted for a
     *  single-column PK, which stays an inline column clause — so snapshots
     *  written before composite keys existed parse and re-serialize unchanged. */
    primaryKey?: string[];
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
