/**
 * Property tests for `diffSnapshots` (`src/diff.ts`).
 *
 * Snapshots come from small pools of table, column and index names, so two
 * generated snapshots share tables and columns often enough to reach the
 * add-column, index and rebuild paths. The strongest property is the parity
 * the README promises: build `a` in SQLite, apply the ops `diffSnapshots(a, b)`
 * returns, and the schema and the rows seeded into `a` match `b` built fresh
 * with the same rows. Two defects it found are kept as failing cases at the
 * end.
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

/** Whether a table the ops do not rebuild ends up in another column order
 *  than `b`'s. SQLite appends an added column, and a column moved without
 *  any other change makes no op at all, so see the failing cases below. */
function reordersWithoutRebuild(ops: TableOp[], a: Snapshot, b: Snapshot): boolean {
    const rebuilt = new Set(
        ops.flatMap((op) => (op.kind === 'rebuildTable' ? [op.table.name] : []))
    );
    return Object.values(b.tables).some((next) => {
        const prev = a.tables[next.name];
        if (prev === undefined || rebuilt.has(next.name)) return false;
        const added = ops.flatMap((op) =>
            op.kind === 'addColumn' && op.table === next.name ? [op.column.name] : []
        );
        const migrated = [...prev.columns.map((c) => c.name), ...added];
        return migrated.join() !== next.columns.map((c) => c.name).join();
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

/** Build `a`, seed it, apply `diffSnapshots(a, b)` to it in one transaction
 *  (as Kysely's `Migrator` does, which `defer_foreign_keys` relies on), build
 *  `b` fresh beside it, and hand both databases to `check`. */
async function migrateAndEmit(
    a: Snapshot,
    b: Snapshot,
    check: (migrated: Kysely<unknown>, fresh: Kysely<unknown>) => Promise<void>,
    seed?: (migrated: Kysely<unknown>, fresh: Kysely<unknown>) => Promise<void>
): Promise<void> {
    const migrated = makeDb();
    const fresh = makeDb();
    try {
        await emit(migrated, a);
        await emit(fresh, b);
        await seed?.(migrated, fresh);
        const statements = diffSnapshots(a, b).ops.flatMap((op) =>
            renderOpStatements(op, 'sqlite')
        );
        await migrated.transaction().execute((trx) => run(trx, statements));
        await check(migrated, fresh);
    } finally {
        await migrated.destroy();
        await fresh.destroy();
    }
}

type Row = Record<string, string | number | null>;

async function insert(db: Kysely<unknown>, name: string, row: Row): Promise<void> {
    const columns = Object.keys(row);
    await sql`INSERT INTO ${sql.table(name)} (${sql.join(columns.map((c) => sql.ref(c)))}) VALUES (${sql.join(columns.map((c) => row[c]))})`.execute(
        db
    );
}

/**
 * Two rows for a table of `a`. Every value is `"b'c"` or `'a'`, which every
 * column kind stores as-is and the enum CHECK accepts, so a copy across a type
 * or kind change keeps it. The rows differ in every column (no unique index
 * trips), the ids match `alpha`'s for the foreign keys, and the second row
 * leaves each nullable column NULL, so a rebuild's `COALESCE` has work to do.
 */
function seedRows(t: SnapshotTable): Row[] {
    const first: Row = {};
    const second: Row = {};
    for (const c of t.columns) {
        first[c.name] = "b'c";
        second[c.name] = c.notNull ? 'a' : null;
    }
    return [first, second];
}

/**
 * Whether `prev`'s rows can be seeded without a foreign key failing for a
 * reason that lies in the data rather than the migration. A table is left
 * empty when:
 *
 * - it points at a table the ops drop or rebuild: either fails at commit once
 *   a row points there (see the failing case below);
 * - `b` gives it a key with no `alpha` in `a`, so the key would point at an
 *   empty new table;
 * - `b` gives a key column a default the rows take (a new column, or NULL
 *   made NOT NULL), and the default is no `alpha` id;
 * - the ops add a NOT NULL `real` column and then an enum column. SQLite
 *   3.45's `quick_check` reads the old rows' `1.5` default as NULL, and an
 *   `ADD COLUMN` with a CHECK runs that check, so the second add fails.
 */
function canSeed(
    prev: SnapshotTable,
    next: SnapshotTable | undefined,
    a: Snapshot,
    ops: TableOp[]
): boolean {
    const replaced = new Set(
        ops.flatMap((op) => {
            if (op.kind === 'dropTable') return [op.name];
            if (op.kind === 'rebuildTable') return [op.table.name];
            return [];
        })
    );
    if (prev.fks.some((f) => replaced.has(f.targetTable))) return false;
    const added = ops.flatMap((op) =>
        op.kind === 'addColumn' && op.table === prev.name ? [op.column] : []
    );
    const realAt = added.findIndex((c) => c.type === 'real' && c.notNull);
    if (realAt !== -1 && added.slice(realAt).some((c) => c.enumValues !== undefined)) {
        return false;
    }
    if (next === undefined || next.fks.length === 0) return true;
    if (!('alpha' in a.tables)) return false;
    return next.fks.every((f) => {
        const before = prev.columns.find((c) => c.name === f.column);
        const after = next.columns.find((c) => c.name === f.column);
        if (after?.default === undefined) return true;
        return before !== undefined && (before.notNull || !after.notNull);
    });
}

/**
 * Seed the tables of `a` into `migrated`, and the rows a migration should
 * leave behind into `fresh`: each row cut to `b`'s columns that were in `a`,
 * with a NULL that `b` makes NOT NULL replaced by `b`'s default (the rebuild's
 * `COALESCE`). A unique index in `b` on a column new to its table would see
 * that column's default in every row, so then every table gets only the row
 * of NULLs, whose ids and key values still match `alpha`'s.
 */
function seedBoth(a: Snapshot, b: Snapshot) {
    const { ops } = diffSnapshots(a, b);
    const oneRow = Object.values(b.tables).some((next) => {
        const before = new Set(a.tables[next.name]?.columns.map((c) => c.name));
        return next.indexes.some(
            (i) => i.unique && i.columns.some((c) => !before.has(c))
        );
    });
    return async (migrated: Kysely<unknown>, fresh: Kysely<unknown>): Promise<void> => {
        for (const prev of Object.values(a.tables)) {
            const next = b.tables[prev.name];
            if (!canSeed(prev, next, a, ops)) continue;
            const seeded = seedRows(prev);
            for (const row of oneRow ? seeded.slice(1) : seeded) {
                await insert(migrated, prev.name, row);
                if (next === undefined) continue;
                const expected: Row = {};
                for (const c of next.columns) {
                    if (!(c.name in row)) continue;
                    const value = row[c.name] ?? null;
                    expected[c.name] =
                        value === null && c.notNull && c.default !== undefined
                            ? c.default
                            : value;
                }
                await insert(fresh, prev.name, expected);
            }
        }
    };
}

/** Every table's rows, by name, ordered by id. */
async function dumpRows(db: Kysely<unknown>): Promise<Record<string, unknown[]>> {
    const tables = (await rows(
        db,
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
    )) as { name: string }[];
    const dumped: Record<string, unknown[]> = {};
    for (const { name } of tables) {
        dumped[name] = await rows(db, `SELECT * FROM \`${name}\` ORDER BY \`id\``);
    }
    return dumped;
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

    it('migrates a database built from a, and its rows, to the schema b builds fresh', async () => {
        await fc.assert(
            fc.asyncProperty(snapshotPairArb, async ([a, b]) => {
                const { ops, errors } = diffSnapshots(a, b);
                fc.pre(errors.length === 0 && !reordersWithoutRebuild(ops, a, b));
                // `dumpSchema` text matches only where no fast-path add landed
                // on a table without a table-level constraint (see below).
                const spliced = new Set(
                    ops.flatMap((op) => {
                        if (op.kind !== 'addColumn') return [];
                        const t = b.tables[op.table];
                        return t?.fks.length === 0 && t.primaryKey === undefined
                            ? [op.table]
                            : [];
                    })
                );
                const dumped = Object.keys(b.tables).filter((n) => !spliced.has(n));
                await migrateAndEmit(
                    a,
                    b,
                    async (migrated, fresh) => {
                        expect(
                            await describeSchema(migrated),
                            'property: applying diff(a, b) to a yields b'
                        ).toEqual(await describeSchema(fresh));
                        expect(
                            await dumpSchema(migrated, { tables: dumped }),
                            'property: the oracle dump matches off the spliced tables'
                        ).toEqual(await dumpSchema(fresh, { tables: dumped }));
                        expect(
                            await dumpRows(migrated),
                            'property: the rows of a survive the migration'
                        ).toEqual(await dumpRows(fresh));
                    },
                    seedBoth(a, b)
                );
            })
        );
    });

    // Found by the parity property above, kept as a plain case. `dumpSchema` is
    // documented as the parity primitive (README, "The oracle") and is core's
    // drift gate (`packages/astromech/tests/database/baseline-ddl-parity.test.ts`).
    // SQLite records `ALTER TABLE ADD COLUMN` by splicing `, <column>` in before
    // the table's first table-level constraint (a foreign key or composite key),
    // or else before the closing `)`. Only that last case differs from a fresh
    // emit: `… NOT NULL , \`c1\` text)` against `… NOT NULL, \`c1\` text )`.
    // The parity property compares the dumps of every other table.
    it('adds a column on the fast path to the same columns as a fresh emit', async () => {
        const a = snap(table('widgets', [col.id()]));
        const b = snap(table('widgets', [col.id(), col.text('c1')]));
        expect(diffSnapshots(a, b).ops.map((op) => op.kind)).toEqual(['addColumn']);
        await migrateAndEmit(a, b, async (migrated, fresh) => {
            expect(await describeSchema(migrated)).toEqual(await describeSchema(fresh));
        });
    });

    it.fails('dumps a fast-path added column the same as a fresh emit', async () => {
        const a = snap(table('widgets', [col.id()]));
        const b = snap(table('widgets', [col.id(), col.text('c1')]));
        await migrateAndEmit(a, b, async (migrated, fresh) => {
            expect(await dumpSchema(migrated)).toEqual(await dumpSchema(fresh));
        });
    });

    // Found by the parity property, kept as plain cases. A new nullable column
    // takes the `ALTER TABLE ADD COLUMN` fast path wherever it sits in the
    // snapshot, but SQLite appends it; and a column moved with no other change
    // makes no op at all. The README makes column order part of the contract.
    // The differ could rebuild the table instead when the order changes.
    const reorders = [
        {
            change: 'a column is added mid-list',
            a: snap(table('widgets', [col.id(), col.text('c2')])),
            b: snap(table('widgets', [col.id(), col.text('c1'), col.text('c2')])),
            migrated: ['id', 'c2', 'c1'],
        },
        {
            change: 'a column is moved',
            a: snap(table('widgets', [col.id(), col.text('c2'), col.text('c1')])),
            b: snap(table('widgets', [col.id(), col.text('c1'), col.text('c2')])),
            migrated: ['id', 'c2', 'c1'],
        },
    ];

    it.each(reorders)(
        'migrates to the columns $migrated when $change',
        async ({ a, b, migrated: order }) => {
            const columnsOf = async (db: Kysely<unknown>): Promise<unknown[]> =>
                (await rows(db, "SELECT name FROM pragma_table_info('widgets')")).map(
                    (row) => (row as { name: string }).name
                );
            await migrateAndEmit(a, b, async (migrated, fresh) => {
                expect(await columnsOf(migrated)).toEqual(order);
                expect(await columnsOf(fresh)).toEqual(['id', 'c1', 'c2']);
            });
        }
    );

    it.fails.each(reorders)(
        'keeps snapshot column order when $change',
        async ({ a, b }) => {
            await migrateAndEmit(a, b, async (migrated, fresh) => {
                expect(await describeSchema(migrated)).toEqual(
                    await describeSchema(fresh)
                );
            });
        }
    );

    // Found by seeding the parity property, kept as plain cases. With foreign
    // keys on, as core requires, dropping a table counts each row that points
    // at it as a violation, and `defer_foreign_keys` only moves the check to
    // the commit. A rebuild's `RENAME` brings the rows back under the old name
    // but does not clear that count, so the commit fails. A dropped table whose
    // reference goes in the same change fails too: the `DROP TABLE` comes
    // before the rebuild that removes the key, and before any deferral.
    const alpha = table('alpha', [col.id(), col.text('c1')]);
    const child = table('beta', [col.id(), col.text('c1')], { fks: [fk('c1', 'alpha')] });
    const referenced = [
        {
            change: 'rebuilds a table another table points at',
            a: snap(alpha, child),
            b: snap(table('alpha', [col.id()]), child),
        },
        {
            change: 'drops a table along with the key pointing at it',
            a: snap(alpha, child),
            b: snap(table('beta', [col.id(), col.text('c1')])),
        },
    ];
    async function seedReference(migrated: Kysely<unknown>): Promise<void> {
        await insert(migrated, 'alpha', { id: 'a', c1: null });
        await insert(migrated, 'beta', { id: 'b', c1: 'a' });
    }

    it.each(referenced)(
        'migrates when it $change and no row points there',
        async ({ a, b }) => {
            expect(diffSnapshots(a, b).errors).toEqual([]);
            await migrateAndEmit(a, b, async (migrated, fresh) => {
                expect(await describeSchema(migrated)).toEqual(
                    await describeSchema(fresh)
                );
            });
        }
    );

    it.fails.each(referenced)(
        'keeps the rows when it $change and a row points there',
        async ({ a, b }) => {
            await migrateAndEmit(
                a,
                b,
                async (migrated) => {
                    expect(await rows(migrated, 'SELECT id, c1 FROM beta')).toEqual([
                        { id: 'b', c1: 'a' },
                    ]);
                },
                seedReference
            );
        }
    );
});
