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

import { drizzle } from 'drizzle-orm/libsql';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';

type LibSQLDriverOptions = {
    url?: string;
    authToken?: string;
};

export function libsqlDriver(options?: LibSQLDriverOptions) {
    let instance: LibSQLDatabase | null = null;

    return {
        type: 'libsql' as const,
        getInstance(): LibSQLDatabase {
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
        },
    };
}
