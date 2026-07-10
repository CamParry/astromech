/**
 * Snapshot builder — a descriptor set's DDL-affecting state, as data.
 *
 * `createSnapshot` captures exactly what determines a table's shape on disk:
 * column storage type/nullability/primary-key/SQL-default/enum values,
 * foreign keys, and indexes (explicit + the unique indexes `ddl.ts`
 * synthesizes from column-level `unique: true`). The migration generator
 * (`diff.ts`) diffs two snapshots to generate migrations, so app-side-only
 * facts (`appDefault`, `onUpdate`, `serialize`/`parse`) are deliberately
 * excluded — they never affect DDL, and including them would trigger a
 * migration diff on a purely app-side change.
 *
 * The `Snapshot*` TYPES and the per-table conversion
 * (`descriptorToSnapshotTable`) live in `ddl.ts`, not here — re-exported
 * below for this module's existing consumers. See `ddl.ts`'s header comment
 * for why (a reverse import here would read as a cycle to dependency-cruiser).
 *
 * Deterministic: tables sorted by name, columns/indexes kept in each
 * descriptor's declaration order (the source of the migration generator's
 * rebuild column mapping), `serializeSnapshot` a plain stable `JSON.stringify`.
 * No `id`/`prevId` chain — divergent parallel `db:generate` runs surface as a
 * `snapshot.json` merge conflict, not a hash mismatch.
 */

import { descriptorToSnapshotTable, type SqlDialect } from '@/database/ddl.js';
import type {
    Snapshot,
    SnapshotColumn,
    SnapshotForeignKey,
    SnapshotIndex,
    SnapshotTable,
} from '@/database/ddl.js';
import type { TableDescriptor } from '@/database/define-table.js';

export type {
    Snapshot,
    SnapshotColumn,
    SnapshotForeignKey,
    SnapshotIndex,
    SnapshotTable,
};

/** Build a deterministic snapshot of the given descriptors' DDL-affecting state. */
export function createSnapshot(
    tables: TableDescriptor[],
    opts: { dialect: SqlDialect }
): Snapshot {
    const entries = tables
        .map((table): [string, SnapshotTable] => [
            table.name,
            descriptorToSnapshotTable(table, opts.dialect),
        ])
        .sort(([a], [b]) => a.localeCompare(b));
    return {
        version: 1,
        dialect: opts.dialect,
        tables: Object.fromEntries(entries),
    };
}

/** Stable JSON rendering of a snapshot (same input → identical output). */
export function serializeSnapshot(snapshot: Snapshot): string {
    return JSON.stringify(snapshot, null, 2);
}
