/**
 * LibSQL / Turso database driver — for local development (SQLite file) and
 * Turso (remote SQLite). URL and auth token read from env vars unless
 * provided explicitly (`libsql()` or `libsql({ url: 'file:./dev.db' })`).
 */

import type { DB } from '@/database/types';
import type { DbDump, RestoreOptions } from '@/types/config';
import type { Client, Config, Row, Transaction } from '@libsql/client';
import type { DialectAdapter } from 'kysely';
import type { MigrationProvider } from 'kysely/migration';
import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { migrateToLatest } from '@astromech/schema-engine';
import { createClient } from '@libsql/client';
import { LibsqlDialect } from '@libsql/kysely-libsql';
import { CamelCasePlugin, Kysely, SqliteAdapter } from 'kysely';
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
 * Check the backup at `file`, then run the code's migration chain forward on it,
 * so its schema is this code's. Refuses a damaged backup, one that records no
 * migrations, and one holding a migration the code does not have.
 */
async function migrateBackup(file: string, migrations: MigrationProvider): Promise<void> {
    const client = createClient({ url: `file:${file}` });
    // The driver's own dialect, so the chain runs as one transaction as it does
    // on the live database.
    const db = new Kysely<DB>({
        dialect: new LocalLibsqlDialect({ client: client as never }),
        plugins: [new CamelCasePlugin()],
    });
    try {
        await assertIntact(client);
        await assertKnownMigrations(client, migrations);
        try {
            await migrateToLatest(db, migrations, { allowUnorderedMigrations: true });
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            throw new AstromechError(
                `the backup could not be brought up to this schema: ${reason}`
            );
        }
    } finally {
        await db.destroy();
        client.close();
    }
}

async function assertIntact(client: Client): Promise<void> {
    const { rows } = await client.execute('PRAGMA quick_check');
    const [first] = rows;
    const ok =
        rows.length === 1 &&
        first !== undefined &&
        String(firstValue(first)).toLowerCase() === 'ok';
    if (!ok) throw new AstromechError('the backup failed its integrity check');
}

/**
 * Refuses a backup holding a migration the code does not have: a newer
 * backup, one from a rebaselined chain, or one from a removed plugin. Plugin
 * chains merge unordered, so the names compare as sets rather than by head.
 */
async function assertKnownMigrations(
    client: Client,
    migrations: MigrationProvider
): Promise<void> {
    const recorded = await migrationNames(client);
    if (recorded.length === 0) {
        throw new AstromechError(
            'the backup records no migrations, so it is not an Astromech database'
        );
    }
    const known = new Set(Object.keys(await migrations.getMigrations()));
    const unknown = recorded.filter((name) => !known.has(name)).sort();
    if (unknown.length === 0) return;
    throw new AstromechError(
        `the backup records ${unknown.length === 1 ? 'a migration' : 'migrations'} this site ` +
            `does not have (${unknown.join(', ')}): restore it with the code and ` +
            'plugins that wrote it'
    );
}

/** The migrations the database records, or none when it has no migration table. */
async function migrationNames(client: Client): Promise<string[]> {
    const table = await client.execute(
        `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'kysely_migration'`
    );
    if (table.rows.length === 0) return [];
    const result = await client.execute('SELECT name FROM kysely_migration');
    return result.rows.map((row) => String(row['name'] ?? firstValue(row)));
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
 * backup whose table has other columns than the live one is refused.
 */
async function copyableColumns(tx: Transaction, table: string): Promise<string> {
    const live = await columnNames(tx, 'main', table);
    if (live.length === 0) {
        throw new AstromechError(
            `table "${table}" is in the backup but not in the database`
        );
    }
    const backup = await columnNames(tx, 'restore_src', table);
    const sameColumns =
        live.length === backup.length && backup.every((name) => live.includes(name));
    if (!sameColumns) {
        throw new AstromechError(
            `table "${table}" has other columns in the backup ` +
                `(${backup.join(', ')}) than in the database (${live.join(', ')})`
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

    function createDialect(): LibsqlDialect {
        // `@libsql/kysely-libsql` pins an older `@libsql/core` whose `Client`
        // type differs from `@libsql/client`'s by an unrelated `sync()` return
        // type; the runtime client is fully compatible.
        const config = { client: getClient() as never };
        return isRemote()
            ? new RemoteLibsqlDialect(config)
            : new LocalLibsqlDialect(config);
    }

    function getInstance(): Kysely<DB> {
        if (!instance) {
            instance = new Kysely<DB>({
                dialect: createDialect(),
                plugins: [new CamelCasePlugin()],
            });
        }
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
            await pipeline(
                Readable.fromWeb(
                    source as unknown as Parameters<typeof Readable.fromWeb>[0]
                ),
                createWriteStream(tmp)
            );
            try {
                await migrateBackup(tmp, migrations);
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
                        await tx.commit();
                    } finally {
                        // Rolls the copy back unless the commit went through.
                        tx.close();
                    }
                } finally {
                    c.close();
                }
            } finally {
                await unlink(tmp).catch(() => undefined);
            }
        },
    };
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
