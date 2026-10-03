/**
 * Property tests for `diffSnapshots` (`src/diff.ts`).
 *
 * Snapshots come from small pools of table, column and index names, so two
 * generated snapshots share tables and columns often enough to reach the
 * add-column, index and rebuild paths. The strongest property is the parity
 * the README promises: build `a` in SQLite, apply the ops `diffSnapshots(a, b)`
 * returns, and the schema and the rows seeded into `a` match `b` built fresh
 * with the same rows. Column order is not part of that contract
 * (`DECISIONS.md`), so the schemas are compared without it. The defects it
 * found are kept as cases at the end, the open one as an expected failure.
 */
import type { TableOp } from '../src/diff';
import type { Snapshot, SnapshotColumn, SnapshotTable } from '../src/model';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@libsql/client';
import { LibsqlDialect } from '@libsql/kysely-libsql';
import fc from 'fast-check';
import { Kysely, sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderTableStatements } from '../src/ddl';
import { diffSnapshots } from '../src/diff';
import { dumpSchema } from '../src/oracle';
import { renderMigrationFile } from '../src/render';
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

/**
 * Only `c1` references, and only the `id` of a table earlier in `TABLE_NAMES`,
 * so keys form chains (`gamma` → `beta` → `alpha`) but no cycle. A key prefers
 * the table just before its own and brings its `c1` column, so a chain of
 * keys is common enough for the drop-order cases to come up.
 */
function tableArb(name: (typeof TABLE_NAMES)[number]): fc.Arbitrary<SnapshotTable> {
    const [nearest, ...further] = TABLE_NAMES.slice(
        0,
        TABLE_NAMES.indexOf(name)
    ).reverse();
    const target =
        nearest === undefined
            ? fc.constant(null)
            : fc.oneof(
                  { weight: 2, arbitrary: fc.constant(nearest) },
                  { weight: 1, arbitrary: fc.constantFrom(null, ...further) }
              );
    return fc
        .record({
            columns: fc.uniqueArray(columnArb, {
                maxLength: COLUMN_NAMES.length,
                selector: (c) => c.name,
            }),
            indexed: fc.subarray([...COLUMN_NAMES]),
            uniqueIndexes: fc.boolean(),
            onDelete: fc.option(fc.constantFrom('no action', 'cascade', 'set null')),
            target,
        })
        .map(({ columns: generated, indexed, uniqueIndexes, onDelete, target }) => {
            const keyed = onDelete !== null && target !== null;
            const columns =
                keyed && !generated.some((c) => c.name === 'c1')
                    ? [col.text('c1'), ...generated]
                    : generated;
            const names = new Set(columns.map((c) => c.name));
            return table(name, [col.id(), ...columns], {
                fks: keyed ? [fk('c1', target, onDelete)] : [],
                indexes: indexed
                    .filter((c) => names.has(c))
                    .map((c) =>
                        index(`idx_${name}_${c}`, [c], { unique: uniqueIndexes })
                    ),
            });
        });
}

/** A foreign key needs its target in the database (a rebuild fails with "no
 *  such table" otherwise), so a table keeps a key only when its target exists. */
function toSnapshot(tables: SnapshotTable[]): Snapshot {
    const names = new Set(tables.map((t) => t.name));
    return snap(
        ...tables.map((t) => ({
            ...t,
            fks: t.fks.filter((f) => names.has(f.targetTable)),
        }))
    );
}

/** Every table half the time, so chains of keys run their full length. */
const snapshotArb: fc.Arbitrary<Snapshot> = fc
    .oneof(fc.constant([...TABLE_NAMES]), fc.subarray([...TABLE_NAMES]))
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
                    { weight: 1, arbitrary: fresh },
                    { weight: 2, arbitrary: fc.constant(null) }
                );
            })
        )
        .map((tables): [Snapshot, Snapshot] => [
            a,
            toSnapshot(tables.filter((t): t is SnapshotTable => t !== null)),
        ])
);

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

let migrationsDir: string;
let migrationCount = 0;

beforeAll(async () => {
    migrationsDir = await mkdtemp(join(tmpdir(), 'schema-engine-parity-'));
});

afterAll(async () => {
    await rm(migrationsDir, { recursive: true, force: true });
});

/** Render `ops` as the generated migration file a site gets, and import it. */
async function importMigration(
    ops: TableOp[]
): Promise<{ up: (db: Kysely<unknown>) => Promise<void> }> {
    migrationCount += 1;
    const file = join(migrationsDir, `${migrationCount}.ts`);
    await writeFile(file, renderMigrationFile(ops, 'sqlite'));
    return (await import(pathToFileURL(file).href)) as {
        up: (db: Kysely<unknown>) => Promise<void>;
    };
}

/** Build `a`, seed it, run the migration generated from `diffSnapshots(a, b)`
 *  on it in one transaction, as core's libsql migrator does, build `b` fresh
 *  beside it, and hand both databases to `check`. */
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
        const migration = await importMigration(diffSnapshots(a, b).ops);
        await migrated.transaction().execute((trx) => migration.up(trx));
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
 * trips), every table has the same two ids for the foreign keys, and the second row
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
 * - its key has a delete action and points at a table the ops rebuild, whose
 *   `DROP TABLE` fires that action on the rows (see the failing case below);
 * - `b` gives it a key whose target is not in `a`, so the key would point at
 *   an empty new table;
 * - `b` gives a key column a default the rows take (a new column, or NULL
 *   made NOT NULL), and the default is no id of the target;
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
    const rebuilt = new Set(
        ops.flatMap((op) => (op.kind === 'rebuildTable' ? [op.table.name] : []))
    );
    const firesAction = prev.fks.some(
        (f) => f.onDelete !== 'no action' && rebuilt.has(f.targetTable)
    );
    if (firesAction) return false;
    const added = ops.flatMap((op) =>
        op.kind === 'addColumn' && op.table === prev.name ? [op.column] : []
    );
    const realAt = added.findIndex((c) => c.type === 'real' && c.notNull);
    if (realAt !== -1 && added.slice(realAt).some((c) => c.enumValues !== undefined)) {
        return false;
    }
    if (next === undefined || next.fks.length === 0) return true;
    if (next.fks.some((f) => !(f.targetTable in a.tables))) return false;
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
 * of NULLs, whose ids and key values still match each other.
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
        const filled = new Set<string>();
        for (const prev of Object.values(a.tables)) {
            const next = b.tables[prev.name];
            if (!canSeed(prev, next, a, ops)) continue;
            // A key points at an earlier table, and a row's key, in `a` or in
            // `b`, needs that table's rows.
            const keys = [...prev.fks, ...(next?.fks ?? [])];
            if (keys.some((f) => !filled.has(f.targetTable))) continue;
            filled.add(prev.name);
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
 * The schema as SQLite reports it: each table's columns by name, its foreign
 * keys, its CHECK clauses and its index statements. Read through the PRAGMAs,
 * a second view beside the oracle's `sqlite_master` text.
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
                `SELECT name, type, "notnull", dflt_value, pk FROM pragma_table_info('${name}') ORDER BY name`
            ),
            fks: await rows(
                db,
                `SELECT "from", "table", "to", on_delete FROM pragma_foreign_key_list('${name}') ORDER BY "from"`
            ),
            checks: (createSql.match(/CHECK \([^)]*\)\)/g) ?? []).sort(),
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
                // Drops follow the foreign keys rather than snapshot order;
                // the next property checks that order.
                expect(
                    { created, dropped: new Set(dropped) },
                    'property: table-level ops follow the table sets'
                ).toEqual({
                    created: Object.keys(b.tables).filter((n) => !(n in a.tables)),
                    dropped: new Set(
                        Object.keys(a.tables).filter((n) => !(n in b.tables))
                    ),
                });
            })
        );
    });

    it('drops no table before a table that points at it', () => {
        fc.assert(
            fc.property(snapshotPairArb, ([a, b]) => {
                const { ops } = diffSnapshots(a, b);
                const dropAt = (name: string): number =>
                    ops.findIndex((op) => op.kind === 'dropTable' && op.name === name);
                // A table that points at a dropped table is dropped too, or
                // rebuilt without the key; either op must come first.
                const removesKeyAt = (name: string): number =>
                    ops.findIndex(
                        (op) =>
                            (op.kind === 'dropTable' && op.name === name) ||
                            (op.kind === 'rebuildTable' && op.table.name === name)
                    );
                const early = Object.values(a.tables).flatMap((from) =>
                    from.fks.flatMap(({ targetTable: to }) => {
                        if (to === from.name || to in b.tables) return [];
                        const before = removesKeyAt(from.name);
                        return before !== -1 && before < dropAt(to)
                            ? []
                            : [`"${to}" is dropped before "${from.name}" lets go of it`];
                    })
                );
                expect(
                    early,
                    'property: no table is dropped before a table that points at it'
                ).toEqual([]);
            })
        );
    });

    it('migrates a database built from a, and its rows, to the schema b builds fresh', async () => {
        await fc.assert(
            fc.asyncProperty(snapshotPairArb, async ([a, b]) => {
                fc.pre(diffSnapshots(a, b).errors.length === 0);
                await migrateAndEmit(
                    a,
                    b,
                    async (migrated, fresh) => {
                        expect(
                            await describeSchema(migrated),
                            'property: applying diff(a, b) to a yields b'
                        ).toEqual(await describeSchema(fresh));
                        expect(
                            await dumpSchema(migrated),
                            'property: the oracle dump matches'
                        ).toEqual(await dumpSchema(fresh));
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

    // Found by the parity property above, kept as plain cases. `dumpSchema` is
    // documented as the parity primitive (README, "The oracle") and is core's
    // drift gate (`packages/astromech/tests/database/baseline-ddl-parity.test.ts`).
    // SQLite records `ALTER TABLE ADD COLUMN` by splicing `, <column>` in before
    // the table's first table-level constraint (a foreign key or composite key),
    // or else before the closing `)`, which leaves
    // `… NOT NULL , \`c1\` text)` where a fresh emit has `… NOT NULL, \`c1\` text )`.
    it('adds a column on the fast path to the same columns as a fresh emit', async () => {
        const a = snap(table('widgets', [col.id()]));
        const b = snap(table('widgets', [col.id(), col.text('c1')]));
        expect(diffSnapshots(a, b).ops.map((op) => op.kind)).toEqual(['addColumn']);
        await migrateAndEmit(a, b, async (migrated, fresh) => {
            expect(await describeSchema(migrated)).toEqual(await describeSchema(fresh));
        });
    });

    it('dumps a fast-path added column the same as a fresh emit', async () => {
        const a = snap(table('widgets', [col.id()]));
        const b = snap(table('widgets', [col.id(), col.text('c1')]));
        await migrateAndEmit(a, b, async (migrated, fresh) => {
            expect(await dumpSchema(migrated)).toEqual(await dumpSchema(fresh));
        });
    });

    // Found by the parity property, kept as plain cases. A new nullable column
    // takes the `ALTER TABLE ADD COLUMN` fast path wherever it sits in the
    // snapshot, and SQLite appends it; a column moved with no other change
    // makes no op at all. Column order is not part of the schema contract
    // (`DECISIONS.md`), so both migrate to a schema the oracle calls equal.
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

    it.each(reorders)(
        'migrates to a schema the oracle matches with a fresh emit when $change',
        async ({ a, b }) => {
            await migrateAndEmit(a, b, async (migrated, fresh) => {
                expect(await describeSchema(migrated)).toEqual(
                    await describeSchema(fresh)
                );
                expect(await dumpSchema(migrated)).toEqual(await dumpSchema(fresh));
            });
        }
    );

    // Found by seeding the parity property. With foreign keys on, as core
    // requires, dropping a table that rows point at either fails at once or,
    // under `defer_foreign_keys`, counts each such row as a violation for the
    // commit. So a dropped table goes after the tables that point at it: after
    // the rebuild that removes their key, or after their own `DROP TABLE`.
    const alpha = table('alpha', [col.id(), col.text('c1')]);
    const child = table('beta', [col.id(), col.text('c1')], { fks: [fk('c1', 'alpha')] });
    const rebuildsReferenced = {
        change: 'rebuilds a table another table points at',
        a: snap(alpha, child),
        b: snap(table('alpha', [col.id()]), child),
    };
    const dropsWithKey = {
        change: 'drops a table along with the key pointing at it',
        a: snap(alpha, child),
        b: snap(table('beta', [col.id(), col.text('c1')])),
    };
    const dropsWithTable = {
        change: 'drops a table along with the table pointing at it',
        a: snap(alpha, child),
        b: snap(),
    };
    const referenced = [rebuildsReferenced, dropsWithKey, dropsWithTable];
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

    it.each([
        { ...dropsWithKey, kept: { beta: [{ id: 'b', c1: 'a' }] } },
        { ...dropsWithTable, kept: {} },
    ])(
        'keeps the other rows when it $change and a row points there',
        async ({ a, b, kept }) => {
            await migrateAndEmit(
                a,
                b,
                async (migrated, fresh) => {
                    expect(await describeSchema(migrated)).toEqual(
                        await describeSchema(fresh)
                    );
                    expect(await dumpRows(migrated)).toEqual(kept);
                },
                seedReference
            );
        }
    );

    // A dropped table that a kept table points at waits for the rebuilds, and
    // so does every dropped table it points at: dropping `alpha` first would
    // cascade through `beta` into `gamma`'s rows before `gamma`'s rebuild
    // removes its key.
    it('keeps the rows of a table whose key it removes when it drops the chain of tables the key points at', async () => {
        const a = snap(
            alpha,
            table('beta', [col.id(), col.text('c1')], {
                fks: [fk('c1', 'alpha', 'cascade')],
            }),
            table('gamma', [col.id(), col.text('c1')], {
                fks: [fk('c1', 'beta', 'cascade')],
            })
        );
        const b = snap(table('gamma', [col.id(), col.text('c1')]));
        expect(diffSnapshots(a, b).errors).toEqual([]);
        await migrateAndEmit(
            a,
            b,
            async (migrated) => {
                expect(await dumpRows(migrated)).toEqual({
                    gamma: [{ id: 'g', c1: 'b' }],
                });
            },
            async (migrated) => {
                await insert(migrated, 'alpha', { id: 'a', c1: null });
                await insert(migrated, 'beta', { id: 'b', c1: 'a' });
                await insert(migrated, 'gamma', { id: 'g', c1: 'b' });
            }
        );
    });

    // The rebuild's `RENAME` brings the rows' target back under the old name
    // but leaves the `DROP TABLE`'s violations on the count. The migration's
    // closing check turns `defer_foreign_keys` off, which clears it.
    it('keeps the rows when it rebuilds a table another table points at and a row points there', async () => {
        const { a, b } = rebuildsReferenced;
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
    });

    // Found by seeding the parity property. The differ refuses a rebuild of a
    // table whose children keep an `ON DELETE` action in `b`, but not when the
    // child is rebuilt too: the parent's rebuild comes first, so its `DROP
    // TABLE` fires the action on the old child rows before the child's rebuild
    // removes the key (`roadmap/planned/schema-engine-defects.md`).
    const actionDropped = (onDelete: string) => ({
        onDelete,
        a: snap(
            alpha,
            table('beta', [col.id(), col.text('c1')], {
                fks: [fk('c1', 'alpha', onDelete)],
            })
        ),
        b: snap(table('alpha', [col.id()]), table('beta', [col.id(), col.text('c1')])),
    });
    const actionsDropped = [actionDropped('cascade'), actionDropped('set null')];

    it.each(actionsDropped)(
        'migrates when it rebuilds a parent and drops a child key ON DELETE $onDelete, with no rows',
        async ({ a, b }) => {
            expect(diffSnapshots(a, b).errors).toEqual([]);
            await migrateAndEmit(a, b, async (migrated, fresh) => {
                expect(await describeSchema(migrated)).toEqual(
                    await describeSchema(fresh)
                );
            });
        }
    );

    it.fails.each(actionsDropped)(
        'keeps the child rows when it rebuilds a parent and drops a child key ON DELETE $onDelete',
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

    it('rolls back a rebuild that leaves a row pointing at nothing', async () => {
        const a = snap(alpha, table('beta', [col.id(), col.text('c1')]));
        const migrated = makeDb();
        try {
            await emit(migrated, a);
            await insert(migrated, 'beta', { id: 'b', c1: 'missing' });
            const migration = await importMigration(
                diffSnapshots(a, snap(alpha, child)).ops
            );

            await expect(
                migrated.transaction().execute((trx) => migration.up(trx))
            ).rejects.toThrow('foreign key check failed: [{"table":"beta"');
            expect(
                await rows(
                    migrated,
                    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
                )
            ).toEqual([{ name: 'alpha' }, { name: 'beta' }]);
            expect(
                await rows(migrated, "SELECT * FROM pragma_foreign_key_list('beta')")
            ).toEqual([]);
            expect(await rows(migrated, 'SELECT id, c1 FROM beta')).toEqual([
                { id: 'b', c1: 'missing' },
            ]);
        } finally {
            await migrated.destroy();
        }
    });
});
