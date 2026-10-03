/**
 * LibSQL / Turso database driver — for local development (SQLite file) and
 * Turso (remote SQLite). URL and auth token read from env vars unless
 * provided explicitly (`libsql()` or `libsql({ url: 'file:./dev.db' })`).
 */

import type { DB } from '@/database/types';
import type { DbDump, RestoreOptions } from '@/types/config';
import type { Client, Config, Row, Transaction } from '@libsql/client';
import type { DialectAdapter } from 'kysely';
import type { Migration, MigrationProvider } from 'kysely/migration';
import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { migrateToLatest } from '@astromech/schema-engine';
import { createClient, LibsqlError } from '@libsql/client';
import { LibsqlDialect } from '@libsql/kysely-libsql';
import { CamelCasePlugin, Kysely, SqliteAdapter } from 'kysely';
import { InvalidBackupError, RestoreRefusedError } from '@/database/errors';
import { resolveEnv } from '@/env';
import { AstromechError } from '@/errors/astromech-error';

export type LibsqlOptions = {
    url?: string;
    authToken?: string;
};

/** First scalar value of a libsql result row (rows are array- and name-indexed). */
function firstValue(row: Row): unknown {
    return (row as unknown as unknown[])[0] ?? Object.values(row)[0];
}

/** `name` as a double-quoted SQL identifier. */
function quoteIdentifier(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Check the backup at `file` and bring it to the site's schema. A backup
 * recording the same migrations as the live database (`live`) stays as it is;
 * any other has the tables in `discard` cleared, then the site's chain run on it.
 */
async function prepareBackup(
    file: string,
    {
        live,
        discard,
        migrations,
    }: { live: string[]; discard: string[]; migrations: MigrationProvider }
): Promise<void> {
    // One connection, so the foreign-key pragma `clearTables` sets holds for
    // the statements after it.
    const client = createClient({ url: `file:${file}`, concurrency: 1 });
    // The driver's own dialect, so the chain runs as one transaction as it does
    // on the live database.
    const db = openKysely(client, { remote: false });
    try {
        await assertIntact(client);
        const recorded = await migrationNames(client, 'main');
        if (recorded.length === 0) {
            throw new InvalidBackupError(
                'the backup records no migrations, so it is not an Astromech database'
            );
        }
        if (sameNames(recorded, live)) return;
        const chain = await loadMigrations(migrations);
        assertKnownMigrations(recorded, chain);
        await clearTables(client, discard);
        try {
            await migrateToLatest(
                db,
                { getMigrations: async () => chain },
                { allowUnorderedMigrations: true }
            );
        } catch (error) {
            throw new AstromechError(
                `the backup could not be brought up to this schema: ${describe(error)}`
            );
        }
    } finally {
        await db.destroy();
        client.close();
    }
}

async function assertIntact(client: Client): Promise<void> {
    const rows = await quickCheck(client);
    const [first] = rows;
    const ok =
        rows.length === 1 &&
        first !== undefined &&
        String(firstValue(first)).toLowerCase() === 'ok';
    if (!ok) throw new InvalidBackupError('the backup failed its integrity check');
}

/**
 * The rows `PRAGMA quick_check` reports. SQLite fails the query itself for a
 * file that is not a database or is too damaged to walk, and those are faults
 * in the backup too.
 */
async function quickCheck(client: Client): Promise<Row[]> {
    try {
        return (await client.execute('PRAGMA quick_check')).rows;
    } catch (error) {
        if (error instanceof LibsqlError && error.code === 'SQLITE_NOTADB') {
            throw new InvalidBackupError('the backup is not a SQLite database');
        }
        if (error instanceof LibsqlError && error.code === 'SQLITE_CORRUPT') {
            throw new InvalidBackupError('the backup failed its integrity check');
        }
        throw error;
    }
}

/** The site's migration chain, read once so every check and the run see the same one. */
async function loadMigrations(
    migrations: MigrationProvider
): Promise<Record<string, Migration>> {
    try {
        return await migrations.getMigrations();
    } catch (error) {
        throw new AstromechError(
            "the site's migration files are needed to restore a backup taken at another " +
                `schema version, and they could not be loaded: ${describe(error)}`
        );
    }
}

/**
 * Refuses a backup holding a migration the code does not have: a newer
 * backup, one from a rebaselined chain, or one from a removed plugin. Plugin
 * chains merge unordered, so the names compare as sets rather than by head.
 */
function assertKnownMigrations(
    recorded: string[],
    chain: Record<string, Migration>
): void {
    const onlyInBackup = difference(recorded, Object.keys(chain));
    if (onlyInBackup.length === 0) return;
    throw new RestoreRefusedError(
        `the backup records ${onlyInBackup.length === 1 ? 'a migration' : 'migrations'} ` +
            `this site does not have (${onlyInBackup.join(', ')}): restore it with the ` +
            'code and plugins that wrote it',
        { onlyInBackup }
    );
}

/**
 * Empty the backup's copy of each table in `tables`, whose rows the restore
 * discards. Foreign keys are off, so the delete cascades into no other table.
 */
async function clearTables(client: Client, tables: string[]): Promise<void> {
    await client.execute('PRAGMA foreign_keys = OFF');
    for (const name of tables) {
        const table = await client.execute({
            sql: "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
            args: [name],
        });
        if (table.rows.length > 0) {
            await client.execute(`DELETE FROM ${quoteIdentifier(name)}`);
        }
    }
    await client.execute('PRAGMA foreign_keys = ON');
}

/**
 * Refuses the swap unless the migrated backup and the live database record the
 * same migrations. Run inside the swap's transaction, before anything is deleted.
 */
async function assertSameMigrations(tx: Transaction): Promise<void> {
    const live = await migrationNames(tx, 'main');
    const restored = await migrationNames(tx, 'restore_src');
    const onlyInDatabase = difference(live, restored);
    const notApplied = difference(restored, live);
    if (onlyInDatabase.length === 0 && notApplied.length === 0) return;
    const reasons = [
        ...(onlyInDatabase.length > 0
            ? [
                  `only in the database: ${onlyInDatabase.join(', ')}, run \`astromech plugin:purge\``,
              ]
            : []),
        ...(notApplied.length > 0
            ? [
                  `not yet applied to the database: ${notApplied.join(', ')}, run \`astromech db:init\``,
              ]
            : []),
    ];
    throw new RestoreRefusedError(
        `the database does not match this site's migrations (${reasons.join('; ')})`,
        {
            ...(onlyInDatabase.length > 0 ? { onlyInDatabase } : {}),
            ...(notApplied.length > 0 ? { notApplied } : {}),
        }
    );
}

/** Refuses the swap when it leaves a row pointing at a row that is gone. */
async function assertForeignKeysHold(tx: Transaction): Promise<void> {
    const { rows } = await tx.execute('PRAGMA main.foreign_key_check');
    const [first] = rows;
    if (first === undefined) return;
    const table = String(first['table']);
    const parent = String(first['parent']);
    throw new RestoreRefusedError(
        `the restore would leave rows in "${table}" pointing at rows "${parent}" no longer holds`,
        { table, parent }
    );
}

/** The migrations `schema` records, or none when it has no migration table. */
async function migrationNames(
    executor: Client | Transaction,
    schema: 'main' | 'restore_src'
): Promise<string[]> {
    const table = await executor.execute(
        `SELECT 1 FROM ${schema}.sqlite_master WHERE type = 'table' AND name = 'kysely_migration'`
    );
    if (table.rows.length === 0) return [];
    const result = await executor.execute(`SELECT name FROM ${schema}.kysely_migration`);
    return result.rows.map((row) => String(row['name'] ?? firstValue(row)));
}

/** The names in `names` that `others` lacks, sorted. */
function difference(names: string[], others: string[]): string[] {
    const exclude = new Set(others);
    return names.filter((name) => !exclude.has(name)).sort();
}

function sameNames(a: string[], b: string[]): boolean {
    return difference(a, b).length === 0 && difference(b, a).length === 0;
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** `file` and the journal files SQLite may leave beside it. */
async function removeDatabaseFiles(file: string): Promise<void> {
    await Promise.all(
        ['', '-wal', '-shm', '-journal'].map((suffix) =>
            unlink(`${file}${suffix}`).catch(() => undefined)
        )
    );
}

async function columnNames(
    tx: Transaction,
    schema: 'main' | 'restore_src',
    table: string
): Promise<string[]> {
    const result = await tx.execute({
        sql: 'SELECT name FROM pragma_table_info(?, ?) ORDER BY cid',
        args: [table, schema],
    });
    return result.rows.map((row) => String(row['name'] ?? firstValue(row)));
}

/**
 * The quoted column list a restore copies one table through. Column order is
 * not part of the schema contract, so the copy matches columns by name, and a
 * backup whose table has other columns than the live one is refused. Runs after
 * `assertSameMigrations`, so a difference here was made outside the migrations.
 */
async function copyableColumns(tx: Transaction, table: string): Promise<string> {
    const live = await columnNames(tx, 'main', table);
    if (live.length === 0) {
        throw new RestoreRefusedError(
            `table "${table}" is in the backup but not in the database, though both ` +
                'record the same migrations',
            { table }
        );
    }
    const backup = await columnNames(tx, 'restore_src', table);
    const sameColumns =
        live.length === backup.length && backup.every((name) => live.includes(name));
    if (!sameColumns) {
        throw new RestoreRefusedError(
            `table "${table}" has other columns in the backup (${backup.join(', ')}) ` +
                `than in the database (${live.join(', ')}), though both record the ` +
                'same migrations',
            { table }
        );
    }
    return live.map(quoteIdentifier).join(', ');
}

export function libsql(options?: LibsqlOptions) {
    let client: Client | null = null;
    let instance: Kysely<DB> | null = null;

    function clientConfig(): Config {
        const authToken = options?.authToken ?? resolveEnv('DATABASE_AUTH_TOKEN');
        return { url: resolveUrl(), ...(authToken && { authToken }) };
    }

    function getClient(): Client {
        if (!client) client = createClient(clientConfig());
        return client;
    }

    function getInstance(): Kysely<DB> {
        if (!instance) instance = openKysely(getClient(), { remote: isRemote() });
        return instance;
    }

    function resolveUrl(): string {
        return options?.url ?? resolveEnv('DATABASE_URL') ?? 'file:./database.db';
    }

    /**
     * Remote only when the url names a libsql server. `file:`, `:memory:` and a
     * bare path are all local databases the developer's machine owns.
     */
    function isRemote(): boolean {
        return /^(libsql|https?|wss?):/i.test(resolveUrl());
    }

    function assertFileUrl(): void {
        const url = resolveUrl();
        if (!url.startsWith('file:')) {
            throw new AstromechError(
                'libsql dump/restore is only supported for local file databases (file:...), not remote libsql/Turso.'
            );
        }
        // `restore()` opens a client of its own, and a second client on an
        // in-memory database gets a new, empty database, not the site's.
        if (url.slice('file:'.length).startsWith(':memory:')) {
            throw new AstromechError(
                'libsql dump/restore is only supported for local file databases, not in-memory ones (file::memory:).'
            );
        }
    }

    return {
        type: 'libsql' as const,
        getInstance,
        supportsTransactions: true,
        isRemote,

        async dump(): Promise<DbDump> {
            assertFileUrl();
            const c = getClient();
            const tmp = join(tmpdir(), `astromech-dump-${randomUUID()}.sqlite`);
            await c.execute(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
            const stream = Readable.toWeb(
                createReadStream(tmp)
            ) as ReadableStream<Uint8Array>;
            return {
                stream,
                cleanup: async () => {
                    await unlink(tmp).catch(() => undefined);
                },
            };
        },

        async restore(
            source: ReadableStream<Uint8Array>,
            { preserve, empty, migrations }: RestoreOptions
        ): Promise<void> {
            assertFileUrl();
            const tmp = join(tmpdir(), `astromech-restore-${randomUUID()}.sqlite`);
            try {
                await pipeline(
                    Readable.fromWeb(
                        source as unknown as Parameters<typeof Readable.fromWeb>[0]
                    ),
                    createWriteStream(tmp)
                );
                await prepareBackup(tmp, {
                    live: await migrationNames(getClient(), 'main'),
                    discard: [...preserve, ...empty],
                    migrations,
                });
                // `ATTACH` and `PRAGMA foreign_keys` change a single connection,
                // and neither works inside a transaction. The driver's client
                // keeps a pool of connections, so separate calls on it can land
                // on different ones, and whichever connection gets this state
                // keeps it for later queries. A client of its own with one
                // connection keeps every statement on that connection, and
                // closing it drops the state. The copy goes through
                // `transaction()`, because the pool rolls back a `BEGIN` sent
                // through `execute()` as soon as that call returns.
                const c = createClient({ ...clientConfig(), concurrency: 1 });
                try {
                    await c.execute(`ATTACH '${tmp.replace(/'/g, "''")}' AS restore_src`);
                    const tablesResult = await c.execute(
                        `SELECT name FROM restore_src.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
                    );
                    const tables = tablesResult.rows.map((row) =>
                        String(row['name'] ?? firstValue(row))
                    );
                    await c.execute('PRAGMA foreign_keys=OFF');
                    const tx = await c.transaction('write');
                    try {
                        await assertSameMigrations(tx);
                        for (const name of tables) {
                            if (preserve.includes(name)) continue;
                            const quoted = quoteIdentifier(name);
                            const columns = await copyableColumns(tx, name);
                            await tx.execute(`DELETE FROM main.${quoted}`);
                            if (empty.includes(name)) continue;
                            await tx.execute(
                                `INSERT INTO main.${quoted} (${columns}) SELECT ${columns} FROM restore_src.${quoted}`
                            );
                        }
                        await assertForeignKeysHold(tx);
                        await tx.commit();
                    } finally {
                        // Rolls the copy back unless the commit went through.
                        tx.close();
                    }
                } finally {
                    c.close();
                }
            } finally {
                await removeDatabaseFiles(tmp);
            }
        },
    };
}

/**
 * A Kysely instance over `client`, with the adapter its kind of database needs.
 * `@libsql/kysely-libsql` pins an older `@libsql/core` whose `Client` type
 * differs only in `sync()`'s return type, so the client passes through a cast.
 */
function openKysely(client: Client, { remote }: { remote: boolean }): Kysely<DB> {
    const config = { client: client as never };
    return new Kysely<DB>({
        dialect: remote
            ? new RemoteLibsqlDialect(config)
            : new LocalLibsqlDialect(config),
        plugins: [new CamelCasePlugin()],
    });
}

/**
 * A libsql database runs DDL inside a transaction, so its adapter says so, and
 * Kysely's `Migrator` then runs a migration chain as one transaction, which a
 * table rebuild's `defer_foreign_keys` needs (`DECISIONS.md`).
 */
class LibsqlAdapter extends SqliteAdapter {
    override get supportsTransactionalDdl(): boolean {
        return true;
    }
}

/**
 * Kysely runs one query at a time per instance on a SQLite adapter, which a
 * local file database keeps. A remote database answers each query on its own
 * request or stream, so its adapter lifts that lock.
 */
class RemoteLibsqlAdapter extends LibsqlAdapter {
    override get supportsMultipleConnections(): boolean {
        return true;
    }
}

class LocalLibsqlDialect extends LibsqlDialect {
    override createAdapter(): DialectAdapter {
        return new LibsqlAdapter();
    }
}

class RemoteLibsqlDialect extends LibsqlDialect {
    override createAdapter(): DialectAdapter {
        return new RemoteLibsqlAdapter();
    }
}
