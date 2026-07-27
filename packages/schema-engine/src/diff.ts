/**
 * Snapshot differ — two `Snapshot`s → the ordered `TableOp`s that carry one to
 * the other, plus generate-time validation.
 *
 * Pure, browser-safe (no fs/db imports) — `generate.ts` is the Node-only
 * orchestrator that reads/writes snapshots on disk and calls this. The rules:
 *
 *   - `prev === null` → every table is a `createTable` (no warnings).
 *   - A table present in `prev` but not `next` → `dropTable` + warning
 *     (removal IS the intent — no `--force`/prompt).
 *   - A table present in `next` but not `prev` → `createTable`.
 *   - Per common table: any column change other than a *purely additive*
 *     column (nullable, or NOT NULL with a literal default, and not a PK)
 *     forces ONE `rebuildTable` op that subsumes every column/FK/index change
 *     on that table (SQLite has no `ALTER COLUMN`/`DROP COLUMN` that survives
 *     CHECK/index constraints, so a changed table is rebuilt wholesale via
 *     `CREATE __new_x` → copy → `DROP` → `RENAME`). Everything else that's
 *     purely additive fast-paths to native `ALTER TABLE ADD COLUMN` /
 *     `CREATE INDEX` / `DROP INDEX`.
 *   - Impossible states (a rebuild's `INSERT…SELECT` can't backfill a NOT
 *     NULL column with no SQL literal, an index naming an unknown column, a
 *     duplicate index name) are collected as hard errors — the caller
 *     (`generate.ts`) refuses to write anything when any exist.
 *
 * Op ordering in the result: `dropIndex`, `dropTable`, `createTable`,
 * `addColumn`, `rebuildTable`, `createIndex` — drops before creates, and
 * rebuilds (which subsume their own index recreation) before any standalone
 * index op so a rebuilt table's fresh indexes are never redundantly touched.
 */

import { MAX_IDENTIFIER_BYTES } from './identifiers.js';
import type {
    Snapshot,
    SnapshotColumn,
    SnapshotForeignKey,
    SnapshotIndex,
    SnapshotTable,
} from './model.js';

export type TableOp =
    | { kind: 'createTable'; table: SnapshotTable }
    | { kind: 'dropTable'; name: string }
    | { kind: 'addColumn'; table: string; column: SnapshotColumn }
    | { kind: 'dropIndex'; table: string; name: string }
    | { kind: 'createIndex'; table: string; index: SnapshotIndex }
    | {
          kind: 'rebuildTable';
          table: SnapshotTable;
          copy: { column: string; coalesceDefault?: string | number }[];
      };

export type DiffResult = { ops: TableOp[]; errors: string[]; warnings: string[] };

function columnsEqual(a: SnapshotColumn, b: SnapshotColumn): boolean {
    return (
        a.kind === b.kind &&
        a.type === b.type &&
        a.notNull === b.notNull &&
        a.primaryKey === b.primaryKey &&
        a.default === b.default &&
        JSON.stringify(a.enumValues ?? null) === JSON.stringify(b.enumValues ?? null)
    );
}

function fksEqual(a: SnapshotForeignKey[], b: SnapshotForeignKey[]): boolean {
    if (a.length !== b.length) return false;
    const norm = (fks: SnapshotForeignKey[]) =>
        fks.map((fk) => JSON.stringify(fk)).sort();
    const na = norm(a);
    const nb = norm(b);
    return na.every((v, i) => v === nb[i]);
}

function indexesEqual(a: SnapshotIndex, b: SnapshotIndex): boolean {
    return (
        a.unique === b.unique &&
        a.where === b.where &&
        a.columns.length === b.columns.length &&
        a.columns.every((c, i) => c === b.columns[i])
    );
}

/** Fast-path `ADD COLUMN` eligibility: nullable, or NOT NULL with a literal
 *  default — and never a primary key (a new PK always forces a rebuild). */
function isFastPathAdd(col: SnapshotColumn): boolean {
    if (col.primaryKey) return false;
    return !col.notNull || col.default !== undefined;
}

type Accumulators = {
    errors: string[];
    warnings: string[];
    addColumnOps: TableOp[];
    rebuildOps: TableOp[];
    dropIndexOps: TableOp[];
    createIndexOps: TableOp[];
};

function diffTable(
    prevTable: SnapshotTable,
    nextTable: SnapshotTable,
    acc: Accumulators
): void {
    const prevCols = new Map(prevTable.columns.map((c) => [c.name, c]));
    const nextCols = new Map(nextTable.columns.map((c) => [c.name, c]));

    let rebuild = false;
    const addedFastPath: SnapshotColumn[] = [];

    for (const colName of prevCols.keys()) {
        if (!nextCols.has(colName)) {
            rebuild = true;
            acc.warnings.push(
                `dropping column "${colName}" on table "${nextTable.name}" — this drops its data`
            );
        }
    }

    for (const [colName, nextCol] of nextCols) {
        const prevCol = prevCols.get(colName);
        if (!prevCol) {
            // Added column.
            if (nextCol.notNull && nextCol.default === undefined) {
                acc.errors.push(
                    `column "${colName}" on table "${nextTable.name}" is NOT NULL with no ` +
                        `SQL-literal default — a rebuild's INSERT…SELECT can't backfill it; add a ` +
                        `literal default or hand-author a data migration`
                );
            }
            if (isFastPathAdd(nextCol)) {
                addedFastPath.push(nextCol);
            } else {
                rebuild = true;
            }
            continue;
        }

        if (!columnsEqual(prevCol, nextCol)) {
            rebuild = true;
            if (!prevCol.notNull && nextCol.notNull && nextCol.default === undefined) {
                acc.errors.push(
                    `column "${colName}" on table "${nextTable.name}" flips to NOT NULL ` +
                        `with no SQL-literal default — a rebuild's INSERT…SELECT can't backfill existing ` +
                        `NULLs; add a literal default or hand-author a data migration`
                );
            }
            if (
                prevCol.enumValues !== undefined &&
                nextCol.enumValues !== undefined &&
                prevCol.enumValues.some((v) => !nextCol.enumValues?.includes(v))
            ) {
                acc.warnings.push(
                    `enum "${colName}" on table "${nextTable.name}" narrowed — a previously-allowed ` +
                        `value was removed; the new CHECK may reject existing rows`
                );
            }
            if (prevCol.type !== nextCol.type) {
                acc.warnings.push(
                    `column "${colName}" on table "${nextTable.name}" storage type changed ` +
                        `(${prevCol.type} → ${nextCol.type}); SQLite copies existing values as-is`
                );
            }
        }
    }

    if (!fksEqual(prevTable.fks, nextTable.fks)) {
        rebuild = true;
    }

    if (rebuild) {
        const copy: { column: string; coalesceDefault?: string | number }[] = [];
        for (const nextCol of nextTable.columns) {
            const prevCol = prevCols.get(nextCol.name);
            if (!prevCol) continue;
            const entry: { column: string; coalesceDefault?: string | number } = {
                column: nextCol.name,
            };
            if (!prevCol.notNull && nextCol.notNull && nextCol.default !== undefined) {
                entry.coalesceDefault = nextCol.default;
            }
            copy.push(entry);
        }
        acc.rebuildOps.push({ kind: 'rebuildTable', table: nextTable, copy });
        return;
    }

    for (const col of addedFastPath) {
        acc.addColumnOps.push({ kind: 'addColumn', table: nextTable.name, column: col });
    }

    // Index diffing — only reached for tables that don't rebuild (a rebuild
    // recreates all of a table's indexes itself; emitting standalone ops here
    // too would double them up).
    const prevIdx = new Map(prevTable.indexes.map((i) => [i.name, i]));
    const nextIdx = new Map(nextTable.indexes.map((i) => [i.name, i]));

    for (const [idxName] of prevIdx) {
        if (!nextIdx.has(idxName)) {
            acc.dropIndexOps.push({
                kind: 'dropIndex',
                table: nextTable.name,
                name: idxName,
            });
        }
    }

    for (const [idxName, idx] of nextIdx) {
        const prevI = prevIdx.get(idxName);
        const isNew = !prevI;
        const changed = prevI !== undefined && !indexesEqual(prevI, idx);
        if (!isNew && !changed) continue;

        if (changed) {
            acc.dropIndexOps.push({
                kind: 'dropIndex',
                table: nextTable.name,
                name: idxName,
            });
        }
        acc.createIndexOps.push({
            kind: 'createIndex',
            table: nextTable.name,
            index: idx,
        });
        if (idx.unique) {
            acc.warnings.push(
                `${isNew ? 'new' : 'changed'} unique index "${idxName}" on table ` +
                    `"${nextTable.name}" — fails at apply if duplicates exist`
            );
        }
    }
}

/** Diff two snapshots into the ordered `TableOp`s (+ errors/warnings) that
 *  carry `prev` to `next`. `prev === null` means "no prior snapshot" — every
 *  table in `next` is a fresh `createTable`. */
export function diffSnapshots(prev: Snapshot | null, next: Snapshot): DiffResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const dropTableOps: TableOp[] = [];
    const createTableOps: TableOp[] = [];
    const acc: Accumulators = {
        errors,
        warnings,
        addColumnOps: [],
        rebuildOps: [],
        dropIndexOps: [],
        createIndexOps: [],
    };

    const prevTables = prev?.tables ?? {};
    const nextTables = next.tables;

    // Table names are never capped or hashed. Unlike a synthesized index name,
    // a table name is something a developer types and reads, so overflowing
    // the identifier budget fails loudly here rather than being mangled.
    for (const name of Object.keys(nextTables)) {
        if (name.length > MAX_IDENTIFIER_BYTES) {
            errors.push(
                `table name "${name}" is ${name.length} bytes — over the ${MAX_IDENTIFIER_BYTES}-byte ` +
                    `identifier limit. Table names are never truncated; shorten it.`
            );
        }
    }

    const indexNameCounts = new Map<string, number>();
    for (const table of Object.values(nextTables)) {
        for (const idx of table.indexes) {
            indexNameCounts.set(idx.name, (indexNameCounts.get(idx.name) ?? 0) + 1);
        }
    }
    for (const [name, count] of indexNameCounts) {
        if (count > 1) {
            errors.push(`duplicate index name "${name}" across the schema`);
        }
    }

    for (const name of Object.keys(prevTables)) {
        if (nextTables[name] === undefined) {
            dropTableOps.push({ kind: 'dropTable', name });
            warnings.push(
                `dropping table "${name}" — this drops its data; table removal is treated as intent`
            );
        }
    }

    for (const [name, table] of Object.entries(nextTables)) {
        const colNames = new Set(table.columns.map((c) => c.name));
        for (const idx of table.indexes) {
            for (const col of idx.columns) {
                if (!colNames.has(col)) {
                    errors.push(
                        `index "${idx.name}" on table "${name}" references unknown column "${col}"`
                    );
                }
            }
        }

        const prevTable = prevTables[name];
        if (!prevTable) {
            createTableOps.push({ kind: 'createTable', table });
            continue;
        }

        diffTable(prevTable, table, acc);
    }

    return {
        ops: [
            ...acc.dropIndexOps,
            ...dropTableOps,
            ...createTableOps,
            ...acc.addColumnOps,
            ...acc.rebuildOps,
            ...acc.createIndexOps,
        ],
        errors,
        warnings,
    };
}
