/**
 * In-memory test harness for the entry data layer.
 *
 * `createTestDb` spins up a libsql `:memory:` database, applies the package
 * migrations from `/drizzle`, and registers it via `setDb` so SDK modules
 * (which call `getDb()` per-op) hit it. `setupTestConfig` resolves a small but
 * representative config and pushes it onto the CLI config shim, which the
 * vitest alias maps `virtual:astromech/config` onto.
 *
 * FK enforcement: libsql enables `PRAGMA foreign_keys` by default. Entry
 * inserts never set `createdBy`/`updatedBy` (both nullable), so no user row is
 * required for the entry flows — `createTestUser` is provided for completeness.
 */

import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/libsql';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { setDb } from '@/db/registry.js';
import { usersTable } from '@/db/schema.js';
import type { UserRow } from '@/db/schema.js';
import { resolveConfig } from '@/core/config-resolver.js';
import { setCliConfig } from '@/cli/virtual-config-shim.js';
import { registerPlugins } from '@/core/plugin-runtime.js';
import { setCurrentUser } from '@/sdk/local/context.js';
import type {
    AstromechConfig,
    DatabaseDriver,
    PluginDefinition,
    ResolvedConfig,
    StorageDriver,
} from '@/types/index.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = LibSQLDatabase<any>;

// Repo-root `/drizzle` — this file lives at src/test/harness.ts, so two levels up.
const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

/**
 * Create a fresh in-memory database, migrate it, and register it globally.
 * Returns the drizzle handle (already the active `getDb()` instance).
 */
export async function createTestDb(): Promise<Db> {
    const db = drizzle({ connection: { url: ':memory:' } });
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    setDb(db);
    return db;
}

const noopStorage: StorageDriver = {
    name: 'test-noop',
    async upload(_file: File, path: string): Promise<string> {
        return `/${path}`;
    },
    async delete(): Promise<void> {
        return undefined;
    },
    getUrl(path: string): string {
        return `/${path}`;
    },
};

const noopDriver: DatabaseDriver = {
    type: 'test',
    getInstance(): Db {
        throw new Error('test driver getInstance should not be called');
    },
};

/**
 * Build a representative config:
 * - `post`: titled, versioning on, translatable on, slug on, with a text field,
 *   a non-translatable field, and a relationship field targeting `post`.
 * - `note`: titled, versioning off, translatable off.
 * Two locales (en default + de) so translation flows are exercisable.
 */
export function makeTestConfig(): AstromechConfig {
    return {
        db: noopDriver,
        storage: noopStorage,
        defaultLocale: 'en',
        locales: ['en', 'de'],
        entries: {
            post: {
                single: 'Post',
                plural: 'Posts',
                versioning: true,
                translatable: true,
                fieldGroups: [
                    {
                        name: 'content',
                        label: 'Content',
                        placement: 'main',
                        fields: [
                            { name: 'body', type: 'text', label: 'Body' },
                            {
                                name: 'category',
                                type: 'text',
                                label: 'Category',
                                translatable: false,
                            },
                        ],
                    },
                    {
                        name: 'relations',
                        label: 'Relations',
                        placement: 'sidebar',
                        fields: [
                            {
                                name: 'related',
                                type: 'relationship',
                                label: 'Related',
                                target: 'post',
                                multiple: true,
                            },
                        ],
                    },
                ],
            },
            note: {
                single: 'Note',
                plural: 'Notes',
                versioning: false,
                translatable: false,
                fieldGroups: [
                    {
                        name: 'content',
                        label: 'Content',
                        placement: 'main',
                        fields: [{ name: 'body', type: 'text', label: 'Body' }],
                    },
                ],
            },
        },
    };
}

/**
 * Resolve the test config and push it onto the CLI config shim so
 * `virtual:astromech/config` resolves under vitest. Also resets the plugin
 * runtime (no hooks) unless `plugins` is supplied.
 */
export function setupTestConfig(
    config: AstromechConfig = makeTestConfig()
): ResolvedConfig {
    const resolved = resolveConfig(config);
    setCliConfig(resolved);
    registerPlugins(config.plugins ?? [], resolved);
    setCurrentUser(null);
    return resolved;
}

/**
 * Register a probe plugin's hooks against the live runtime. Pass the same
 * resolved config used by `setupTestConfig`.
 */
export function registerTestPlugins(
    plugins: PluginDefinition[],
    resolved: ResolvedConfig
): void {
    registerPlugins(plugins, resolved);
}

/** Insert a user row (entries reference users via nullable FKs). */
export async function createTestUser(
    db: Db,
    overrides: Partial<UserRow> = {}
): Promise<UserRow> {
    const rows = await db
        .insert(usersTable)
        .values({
            email: overrides.email ?? `user-${crypto.randomUUID()}@test.dev`,
            name: overrides.name ?? 'Test User',
            ...overrides,
        })
        .returning();
    const user = rows[0];
    if (!user) throw new Error('failed to insert test user');
    return user;
}
