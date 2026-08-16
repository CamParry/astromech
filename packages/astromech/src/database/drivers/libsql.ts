/**
 * LibSQL / Turso Database Driver
 *
 * For local development (SQLite file) and Turso (remote SQLite).
 * URL and auth token are read from environment variables if not provided explicitly.
 *
 * Usage:
 *   import { libsql } from 'astromech/database/libsql';
 *   db: libsql()                          // reads DATABASE_URL from env
 *   db: libsql({ url: 'file:./dev.db' })  // explicit URL
 */

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createClient, type Client, type Row } from '@libsql/client';
import { Kysely, CamelCasePlugin } from 'kysely';
import { LibsqlDialect } from '@libsql/kysely-libsql';
import type { DB } from '@/database/types';
import type { DbDump } from '@/types/config';

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

    function getClient(): Client {
        if (!client) {
            const url = options?.url ?? process.env.DATABASE_URL ?? 'file:./database.db';
            const authToken = options?.authToken ?? process.env.DATABASE_AUTH_TOKEN;
            client = createClient({ url, ...(authToken && { authToken }) });
        }
        return client;
    }

    function createDialect(): LibsqlDialect {
        // `@libsql/kysely-libsql` pins an older `@libsql/core` whose `Client`
        // type differs from `@libsql/client`'s by an unrelated `sync()` return
        // type; the runtime client is fully compatible.
        return new LibsqlDialect({ client: getClient() as never });
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
        return options?.url ?? process.env.DATABASE_URL ?? 'file:./database.db';
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
            throw new Error(
                '[astromech] libsql dump/restore is only supported for local file databases (file:...), not remote libsql/Turso.'
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
            const c = getClient();
            const tmp = join(tmpdir(), `astromech-restore-${randomUUID()}.sqlite`);
            await pipeline(
                Readable.fromWeb(
                    source as unknown as Parameters<typeof Readable.fromWeb>[0]
                ),
                createWriteStream(tmp)
            );
            const esc = tmp.replace(/'/g, "''");
            try {
                await c.execute(`ATTACH '${esc}' AS restore_src`);
                try {
                    const checkResult = await c.execute(`PRAGMA restore_src.quick_check`);
                    const checkRows = checkResult.rows ?? [];
                    const firstRow = checkRows[0];
                    const firstStr =
                        firstRow !== undefined
                            ? String(firstValue(firstRow)).toLowerCase()
                            : '';
                    const ok = checkRows.length === 1 && firstStr === 'ok';
                    if (!ok)
                        throw new Error(
                            '[astromech] restore: backup failed integrity check'
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
                    await c.execute('BEGIN');
                    try {
                        for (const { name } of tables) {
                            if (preserve.includes(name)) continue;
                            const q = name.replace(/"/g, '""');
                            await c.execute(`DELETE FROM main."${q}"`);
                            await c.execute(
                                `INSERT INTO main."${q}" SELECT * FROM restore_src."${q}"`
                            );
                        }
                        await c.execute('COMMIT');
                    } catch (e) {
                        await c.execute('ROLLBACK');
                        throw e;
                    } finally {
                        await c.execute('PRAGMA foreign_keys=ON');
                    }
                } finally {
                    await c.execute('DETACH restore_src');
                }
            } finally {
                await unlink(tmp).catch(() => undefined);
            }
        },
    };
}
