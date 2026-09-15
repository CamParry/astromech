/**
 * LibSQL / Turso database driver — for local development (SQLite file) and
 * Turso (remote SQLite). URL and auth token read from env vars unless
 * provided explicitly (`libsql()` or `libsql({ url: 'file:./dev.db' })`).
 */

import type { DB } from '@/database/types';
import type { DbDump } from '@/types/config';
import type { Client, Config, Row } from '@libsql/client';
import type { DialectAdapter } from 'kysely';
import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
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
        return isRemote() ? new RemoteLibsqlDialect(config) : new LibsqlDialect(config);
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
        createDialect,
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
            { preserve }: { preserve: string[] }
        ): Promise<void> {
            assertFileUrl();
            const tmp = join(tmpdir(), `astromech-restore-${randomUUID()}.sqlite`);
            await pipeline(
                Readable.fromWeb(
                    source as unknown as Parameters<typeof Readable.fromWeb>[0]
                ),
                createWriteStream(tmp)
            );
            const esc = tmp.replace(/'/g, "''");
            try {
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
                    await c.execute(`ATTACH '${esc}' AS restore_src`);
                    const checkResult = await c.execute(`PRAGMA restore_src.quick_check`);
                    const checkRows = checkResult.rows ?? [];
                    const firstRow = checkRows[0];
                    const firstStr =
                        firstRow !== undefined
                            ? String(firstValue(firstRow)).toLowerCase()
                            : '';
                    const ok = checkRows.length === 1 && firstStr === 'ok';
                    if (!ok)
                        throw new AstromechError(
                            'restore: backup failed integrity check'
                        );
                    const tablesResult = await c.execute(
                        `SELECT name FROM restore_src.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
                    );
                    const tables = (tablesResult.rows ?? []).map((row) => ({
                        name: String(
                            (row as unknown as Record<string, unknown>)['name'] ??
                                firstValue(row)
                        ),
                    }));
                    await c.execute('PRAGMA foreign_keys=OFF');
                    const tx = await c.transaction('write');
                    try {
                        for (const { name } of tables) {
                            if (preserve.includes(name)) continue;
                            const q = name.replace(/"/g, '""');
                            await tx.execute(`DELETE FROM main."${q}"`);
                            await tx.execute(
                                `INSERT INTO main."${q}" SELECT * FROM restore_src."${q}"`
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
 * Kysely's `SqliteAdapter` makes Kysely run one query at a time per instance,
 * which a local file database keeps. A remote database answers each query on
 * its own request or stream, so its dialect lifts that lock.
 */
class RemoteLibsqlDialect extends LibsqlDialect {
    override createAdapter(): DialectAdapter {
        return new RemoteSqliteAdapter();
    }
}

class RemoteSqliteAdapter extends SqliteAdapter {
    override get supportsMultipleConnections(): boolean {
        return true;
    }
}
