/**
 * Property tests for `diffSnapshots` (`src/diff.ts`).
 *
 * Snapshots come from small pools of table, column and index names, so two
 * generated snapshots share tables and columns often enough to reach the
 * add-column, index and rebuild paths. The strongest property is the parity
 * the README promises: build `a` in SQLite, apply the ops `diffSnapshots(a, b)`
 * returns, and the schema matches `b` built fresh. Two defects it found are
 * kept as failing cases at the end.
 */
import type { TableOp } from '../src/diff';
import type { Snapshot, SnapshotColumn, SnapshotTable } from '../src/model';
import { createClient } from '@libsql/client';
import { LibsqlDialect } from '@libsql/kysely-libsql';
import fc from 'fast-check';
import { Kysely, sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { renderTableStatements } from '../src/ddl';
import { diffSnapshots } from '../src/diff';
import { dumpSchema } from '../src/oracle';
import { renderOpStatements } from '../src/render';
import { col, fk, index, snap, table } from './_support/tables';

const TABLE_NAMES = ['alpha', 'beta', 'gamma'] as const;
const COLUMN_NAMES = ['c1', 'c2', 'c3', 'c4'] as const;

const columnArb: fc.Arbitrary<SnapshotColumn> = fc
    .record({
        name: fc.constantFrom(...COLUMN_NAMES),
        kind: fc.constantFrom('text', 'integer', 'real', 'enum'),
        notNull: fc.boolean(),
        withDefault: fc.boolean(),
    })
    .map(({ name, kind, notNull, withDefault }) => {
        switch (kind) {
            case 'integer':
                return col.integer(name, { notNull, ...(withDefault && { default: 7 }) });
            case 'real':
                return col.real(name, { notNull, ...(withDefault && { default: 1.5 }) });
            case 'enum':
                return col.enum(name, ['a', "b'c"], {
                    notNull,
                    ...(withDefault && { default: 'a' }),
                });
            default:
                return col.text(name, {
                    notNull,
                    ...(withDefault && { default: "it's" }),
                });
        }
    });

function tableArb(name: string): fc.Arbitrary<SnapshotTable> {
    return fc
        .record({
            columns: fc.uniqueArray(columnArb, {
                maxLength: COLUMN_NAMES.length,
                selector: (c) => c.name,
            }),
            indexed: fc.subarray([...COLUMN_NAMES]),
            uniqueIndexes: fc.boolean(),
            onDelete: fc.option(fc.constantFrom('no action', 'cascade', 'set null')),
        })
        .map(({ columns, indexed, uniqueIndexes, onDelete }) => {
            const names = new Set(columns.map((c) => c.name));
            return table(name, [col.id(), ...columns], {
                // Only `c1` references, and only another table's `id`.
                fks:
                    onDelete !== null && names.has('c1') && name !== 'alpha'
                        ? [fk('c1', 'alpha', onDelete)]
                        : [],
                indexes: indexed
                    .filter((c) => names.has(c))
                    .map((c) =>
                        index(`idx_${name}_${c}`, [c], { unique: uniqueIndexes })
                    ),
            });
        });
}

/** A foreign key needs its target in the database (a rebuild fails with "no
 *  such table" otherwise), so a table keeps its key only when `alpha` exists. */
function toSnapshot(tables: SnapshotTable[]): Snapshot {
    const hasAlpha = tables.some((t) => t.name === 'alpha');
    return snap(...tables.map((t) => (hasAlpha ? t : { ...t, fks: [] })));
}

const snapshotArb: fc.Arbitrary<Snapshot> = fc
    .subarray([...TABLE_NAMES])
    .chain((names) => fc.tuple(...names.map(tableArb)))
    .map(toSnapshot);

/** `prev` with a small edit: a column dropped, a new one (with or without an
 *  index) inserted anywhere in the column list, and its indexes thinned out
 *  or flipped between unique and plain. */
function editTable(prev: SnapshotTable): fc.Arbitrary<SnapshotTable> {
    return fc
        .record({
            dropFirst: fc.boolean(),
            added: columnArb,
            position: fc.nat(),
            indexAdded: fc.boolean(),
            keptIndexes: fc.subarray(prev.indexes),
            flipUnique: fc.boolean(),
        })
        .map(({ dropFirst, added, position, indexAdded, keptIndexes, flipUnique }) => {
            const columns = prev.columns.filter((c) => !c.primaryKey);
            if (dropFirst) columns.shift();
            if (!columns.some((c) => c.name === added.name)) {
                columns.splice(position % (columns.length + 1), 0, added);
            }
            const names = new Set(columns.map((c) => c.name));
            const indexes = keptIndexes
                .filter((i) => i.columns.every((c) => names.has(c)))
                .map((i) => (flipUnique ? { ...i, unique: !i.unique } : i));
            if (
                indexAdded &&
                !indexes.some((i) => i.name === `idx_${prev.name}_${added.name}`)
            ) {
                indexes.push(index(`idx_${prev.name}_${added.name}`, [added.name]));
            }
            return table(prev.name, [col.id(), ...columns], {
                fks: prev.fks.filter((f) => names.has(f.column)),
                indexes,
            });
        });
}

/** Two snapshots that share most tables, so `b` is usually a small change to
 *  `a`: each table is kept, edited, regenerated or left out. */
const snapshotPairArb: fc.Arbitrary<[Snapshot, Snapshot]> = snapshotArb.chain((a) =>
    fc
        .tuple(
            ...TABLE_NAMES.map((name) => {
                const prev = a.tables[name];
                const fresh = fc.option(tableArb(name), { freq: 3 });
                if (prev === undefined) return fresh;
                return fc.oneof(
                    { weight: 3, arbitrary: fc.constant(prev) },
                    { weight: 3, arbitrary: editTable(prev) },
                    { weight: 1, arbitrary: fresh }
                );
            })
        )
        .map((tables): [Snapshot, Snapshot] => [
            a,
            toSnapshot(tables.filter((t): t is SnapshotTable => t !== null)),
        ])
);

/** Whether an `addColumn` op adds a column anywhere but the end of `b`'s
 *  column list. SQLite can only append, so see the failing case below. */
function addsBeforeTheEnd(ops: TableOp[], b: Snapshot): boolean {
    const added = new Map<string, string[]>();
    for (const op of ops) {
        if (op.kind === 'addColumn') {
            added.set(op.table, [...(added.get(op.table) ?? []), op.column.name]);
        }
    }
    return [...added].some(([name, columns]) => {
        const tail = b.tables[name]?.columns.slice(-columns.length).map((c) => c.name);
        return JSON.stringify(tail) !== JSON.stringify(columns);
    });
}

function makeDb(): Kysely<unknown> {
    const client = createClient({ url: ':memory:' });
    return new Kysely<unknown>({
        dialect: new LibsqlDialect({ client: client as never }),
    });
}

async function run(db: Kysely<unknown>, statements: string[]): Promise<void> {
    for (const statement of statements) await sql.raw(statement).execute(db);
}

async function emit(db: Kysely<unknown>, snapshot: Snapshot): Promise<void> {
    await run(db, Object.values(snapshot.tables).flatMap(renderTableStatements));
}

/** Build `a`, apply `diffSnapshots(a, b)` to it, build `b` fresh beside it,
 *  and hand both databases to `check`. */
async function migrateAndEmit(
    a: Snapshot,
    b: Snapshot,
    check: (migrated: Kysely<unknown>, fresh: Kysely<unknown>) => Promise<void>
): Promise<void> {
    const migrated = makeDb();
    const fresh = makeDb();
    try {
        await emit(migrated, a);
        await run(
            migrated,
            diffSnapshots(a, b).ops.flatMap((op) => renderOpStatements(op, 'sqlite'))
        );
        await emit(fresh, b);
        await check(migrated, fresh);
    } finally {
        await migrated.destroy();
        await fresh.destroy();
    }
}

async function rows(db: Kysely<unknown>, query: string): Promise<unknown[]> {
    return (await sql.raw<unknown>(query).execute(db)).rows;
}

/**
 * The schema as SQLite reports it: each table's columns in order, its foreign
 * keys, its CHECK clauses and its index statements. Read through the PRAGMAs
 * rather than `sqlite_master` text, which `ALTER TABLE ADD COLUMN` formats
 * differently from a fresh `CREATE TABLE` (see the failing case below).
 */
async function describeSchema(db: Kysely<unknown>): Promise<unknown> {
    const tables = (await rows(
        db,
        "SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name"
    )) as { name: string; sql: string }[];
    const described = [];
    for (const { name, sql: createSql } of tables) {
        described.push({
            name,
            columns: await rows(
                db,
                `SELECT name, type, "notnull", dflt_value, pk FROM pragma_table_info('${name}') ORDER BY cid`
            ),
            fks: await rows(
                db,
                `SELECT "from", "table", "to", on_delete FROM pragma_foreign_key_list('${name}') ORDER BY "from"`
            ),
            checks: createSql.match(/CHECK \([^)]*\)\)/g) ?? [],
            indexes: await rows(
                db,
                `SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = '${name}' AND sql IS NOT NULL ORDER BY name`
            ),
        });
    }
    return described;
}

describe('diffSnapshots properties', () => {
    it('diffs a snapshot against itself to no ops and no warnings', () => {
        fc.assert(
            fc.property(snapshotArb, (a) => {
                const { ops, warnings } = diffSnapshots(a, a);
                expect(
                    { ops, warnings },
                    'property: an unchanged snapshot needs no migration'
                ).toEqual({ ops: [], warnings: [] });
            })
        );
    });

    it('creates every table of a snapshot diffed from nothing, and nothing else', () => {
        fc.assert(
            fc.property(snapshotArb, (b) => {
                expect(
                    diffSnapshots(null, b).ops,
                    'property: a first diff is one createTable per table'
                ).toEqual(
                    Object.values(b.tables).map((t) => ({
                        kind: 'createTable',
                        table: t,
                    }))
                );
            })
        );
    });

    it('creates the tables only in b and drops the tables only in a', () => {
        fc.assert(
            fc.property(snapshotPairArb, ([a, b]) => {
                const { ops } = diffSnapshots(a, b);
                const created = ops.flatMap((op) =>
                    op.kind === 'createTable' ? [op.table.name] : []
                );
                const dropped = ops.flatMap((op) =>
                    op.kind === 'dropTable' ? [op.name] : []
                );
                expect(
                    { created, dropped },
                    'property: table-level ops follow the table sets'
                ).toEqual({
                    created: Object.keys(b.tables).filter((n) => !(n in a.tables)),
                    dropped: Object.keys(a.tables).filter((n) => !(n in b.tables)),
                });
            })
        );
    });

    it('migrates a database built from a to the schema b builds fresh', async () => {
        await fc.assert(
            fc.asyncProperty(snapshotPairArb, async ([a, b]) => {
                const { ops, errors } = diffSnapshots(a, b);
                fc.pre(errors.length === 0 && !addsBeforeTheEnd(ops, b));
                await migrateAndEmit(a, b, async (migrated, fresh) => {
                    expect(
                        await describeSchema(migrated),
                        'property: applying diff(a, b) to a yields b'
                    ).toEqual(await describeSchema(fresh));
                });
            })
        );
    });

    // Found by the parity property above, kept as a plain case. `dumpSchema` is
    // documented as the parity primitive (README, "The oracle") and is core's
    // drift gate (`packages/astromech/tests/database/baseline-ddl-parity.test.ts`),
    // but SQLite records `ALTER TABLE ADD COLUMN` by splicing `, <column>` in
    // after the last token, so a fast-path add never matches a fresh emit:
    // `… NOT NULL , \`c1\` text)` against `… NOT NULL, \`c1\` text )`.
    it.fails('dumps a fast-path added column the same as a fresh emit', async () => {
        const a = snap(table('widgets', [col.id()]));
        const b = snap(table('widgets', [col.id(), col.text('c1')]));
        await migrateAndEmit(a, b, async (migrated, fresh) => {
            expect(await dumpSchema(migrated)).toEqual(await dumpSchema(fresh));
        });
    });

    // Found by the parity property, kept as a plain case. A new nullable
    // column takes the `ALTER TABLE ADD COLUMN` fast path wherever it sits in
    // the snapshot, but SQLite appends it, so the migrated table's columns are
    // `id, c2, c1` where a fresh emit has `id, c1, c2`. The README makes column
    // order part of the contract. The differ could rebuild the table instead
    // when an added column is not last.
    it.fails('keeps snapshot column order when a column is added mid-list', async () => {
        const a = snap(table('widgets', [col.id(), col.text('c2')]));
        const b = snap(table('widgets', [col.id(), col.text('c1'), col.text('c2')]));
        await migrateAndEmit(a, b, async (migrated, fresh) => {
            expect(await describeSchema(migrated)).toEqual(await describeSchema(fresh));
        });
    });
});
