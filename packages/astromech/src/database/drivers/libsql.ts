/**
 * LibSQL / Turso Database Driver
 *
 * For local development (SQLite file) and Turso (remote SQLite).
 * URL and auth token are read from environment variables if not provided explicitly.
 *
 * Usage:
 *   import { libsqlDriver } from 'astromech';
 *   db: libsqlDriver()                          // reads DATABASE_URL from env
 *   db: libsqlDriver({ url: 'file:./dev.db' })  // explicit URL
 */

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { drizzle } from 'drizzle-orm/libsql';
import { sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type { DbDump } from '@/types/config.js';

type LibSQLDriverOptions = {
    url?: string;
    authToken?: string;
};

export function libsqlDriver(options?: LibSQLDriverOptions) {
    let instance: LibSQLDatabase | null = null;

    function getInstance(): LibSQLDatabase {
        if (!instance) {
            const url = options?.url ?? process.env.DATABASE_URL ?? 'file:./database.db';
            const authToken = options?.authToken ?? process.env.DATABASE_AUTH_TOKEN;

            instance = drizzle({
                connection: {
                    url,
                    ...(authToken && { authToken }),
                },
            });
        }
        return instance;
    }

    function resolveUrl(): string {
        return options?.url ?? process.env.DATABASE_URL ?? 'file:./database.db';
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

        async dump(): Promise<DbDump> {
            assertFileUrl();
            const db = getInstance();
            const tmp = join(tmpdir(), `astromech-dump-${randomUUID()}.sqlite`);
            await db.run(sql.raw(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`));
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
            const db = getInstance();
            const tmp = join(tmpdir(), `astromech-restore-${randomUUID()}.sqlite`);
            await pipeline(
                Readable.fromWeb(
                    source as unknown as Parameters<typeof Readable.fromWeb>[0]
                ),
                createWriteStream(tmp)
            );
            const esc = tmp.replace(/'/g, "''");
            try {
                await db.run(sql.raw(`ATTACH '${esc}' AS restore_src`));
                try {
                    const checkResult = await db.run(
                        sql.raw(`PRAGMA restore_src.quick_check`)
                    );
                    const checkRows = checkResult.rows ?? [];
                    const firstRow = checkRows[0];
                    const firstValue =
                        firstRow !== undefined
                            ? String(
                                  Array.isArray(firstRow)
                                      ? (firstRow as unknown[])[0]
                                      : Object.values(
                                            firstRow as Record<string, unknown>
                                        )[0]
                              ).toLowerCase()
                            : '';
                    const ok = checkRows.length === 1 && firstValue === 'ok';
                    if (!ok)
                        throw new Error(
                            '[astromech] restore: backup failed integrity check'
                        );
                    const tablesResult = await db.run(
                        sql.raw(
                            `SELECT name FROM restore_src.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
                        )
                    );
                    const tables = (tablesResult.rows ?? []).map((row) => {
                        // Row is array-indexed; columns[0] = 'name'
                        const r = row as unknown as Record<string, unknown>;
                        return {
                            name: String(r['name'] ?? (row as unknown as unknown[])[0]),
                        };
                    });
                    await db.run(sql.raw('PRAGMA foreign_keys=OFF'));
                    await db.run(sql.raw('BEGIN'));
                    try {
                        for (const { name } of tables) {
                            if (preserve.includes(name)) continue;
                            const q = name.replace(/"/g, '""');
                            await db.run(sql.raw(`DELETE FROM main."${q}"`));
                            await db.run(
                                sql.raw(
                                    `INSERT INTO main."${q}" SELECT * FROM restore_src."${q}"`
                                )
                            );
                        }
                        await db.run(sql.raw('COMMIT'));
                    } catch (e) {
                        await db.run(sql.raw('ROLLBACK'));
                        throw e;
                    } finally {
                        await db.run(sql.raw('PRAGMA foreign_keys=ON'));
                    }
                } finally {
                    await db.run(sql.raw('DETACH restore_src'));
                }
            } finally {
                await unlink(tmp).catch(() => undefined);
            }
        },
    };
}
