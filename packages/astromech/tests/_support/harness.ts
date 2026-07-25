/**
 * In-memory test harness for the entry data layer.
 *
 * `createTestDb` spins up a libsql `:memory:` database, applies
 * `apps/demo/migrations`' full migration chain, and registers it via `setDb`
 * so SDK modules (which call `getDb()` per-op) hit it. Running the real
 * migration chain (rather than a throwaway test-only schema) means every
 * harness-based test also exercises the generated `migrationProvider`.
 * `setupTestConfig` resolves a small but representative config and pushes it
 * onto the CLI config shim, which the vitest alias maps
 * `virtual:astromech/config` onto.
 *
 * FK enforcement: libsql enables `PRAGMA foreign_keys` by default. Entry
 * inserts never set `createdBy`/`updatedBy` (both nullable), so no user row is
 * required for the entry flows — `createTestUser` is provided for completeness.
 */

import { createClient } from '@libsql/client';
import { Kysely, CamelCasePlugin } from 'kysely';
import type { Insertable, MigrationProvider } from 'kysely';
import { LibsqlDialect } from '@libsql/kysely-libsql';
import { setDb, setDbClient } from '@/database/registry.js';
import { mergeMigrationProviders, migrateToLatest } from '@astromech/schema-engine';
import { encode, decode } from '@/database/codec.js';
import type { DB } from '@/database/types.js';
import type { UserRow } from '@/database/schema.js';
import { resolveConfig } from '@/kernel/config-resolver.js';
import { setCliConfig } from '@/transport/cli/virtual-config-shim.js';
import { setRuntimeConfig } from '@/cron/registry.js';
import { registerPlugins } from '@/plugins/runtime/plugin-runtime.js';
import { wireEntryAccess } from '@/entries/plugin-access.js';
import { setCurrentUser } from '@/context/index.js';
import type {
    AstromechConfig,
    DatabaseDriver,
    PluginDefinition,
    ResolvedConfig,
    StorageDriver,
} from '@/types/index.js';

// Wire the entry-access port (entries → runtime dependency inversion) once for
// every harness-based test, before any registerPlugins call below.
wireEntryAccess();

type Db = Kysely<DB>;

/** Plugins whose generated baselines the harness chain includes. */
const FIRST_PARTY_PLUGIN_MIGRATIONS = ['redirects', 'backups'] as const;

/**
 * Build a Kysely instance over a libsql `url`, register it (+ its raw client)
 * globally, and apply the full migration chain. The app-owned migration
 * provider lives outside this package's rootDir, so it is imported
 * dynamically by URL (vitest resolves the .ts) to avoid pulling apps/demo
 * into the tsconfig project.
 */
async function buildTestDb(url: string): Promise<Db> {
    const client = createClient({ url });
    const db = new Kysely<DB>({
        // `@libsql/kysely-libsql` pins an older `@libsql/core` Client type; the
        // runtime client is compatible (see the libsql driver).
        dialect: new LibsqlDialect({ client: client as never }),
        plugins: [new CamelCasePlugin()],
    });
    setDb(db);
    setDbClient(client);
    const { migrationProvider } = await import(
        new URL('../../../../apps/demo/migrations/index.ts', import.meta.url).href
    );
    // The first-party plugins own their tables now, so the app chain alone no
    // longer creates them. Apply exactly what a real boot applies: the merged
    // provider. `allowUnorderedMigrations` mirrors `kernel/boot.ts` — plugin
    // migrations interleave with the app's in one `kysely_migration` table.
    const plugins = await Promise.all(
        FIRST_PARTY_PLUGIN_MIGRATIONS.map(async (alias) => {
            const mod = await import(
                new URL(`../../../plugins/${alias}/migrations/index.ts`, import.meta.url)
                    .href
            );
            return { alias, provider: mod.migrationProvider as MigrationProvider };
        })
    );
    await migrateToLatest(db, mergeMigrationProviders(migrationProvider, plugins), {
        allowUnorderedMigrations: true,
    });
    return db;
}

/**
 * Create a fresh in-memory database, migrate it, and register it globally.
 * Returns the Kysely handle (already the active `getDb()` instance).
 */
export async function createTestDb(): Promise<Db> {
    return buildTestDb(':memory:');
}

/**
 * Like {@link createTestDb} but against a temp FILE db (e.g. `file:/tmp/x.db`).
 * Tests that read results committed inside a storage transaction must use this:
 * on a `:memory:` db a committed transaction poisons the base connection
 * (post-commit reads throw "no such table").
 */
export async function createFileTestDb(url: string): Promise<Db> {
    return buildTestDb(url);
}

const noopStorage: StorageDriver = {
    name: 'test-noop',
    async put(): Promise<void> {
        return undefined;
    },
    async get(): Promise<null> {
        return null;
    },
    async delete(): Promise<void> {
        return undefined;
    },
    async list(): Promise<string[]> {
        return [];
    },
    getDirectUrl(key: string): string | null {
        return `/${key}`;
    },
};

const noopDriver: DatabaseDriver = {
    type: 'test',
    getInstance(): Kysely<DB> {
        throw new Error('test driver getInstance should not be called');
    },
};

/**
 * Build a representative config:
 * - `post`: titled, versioning on, translatable on, slug on, with a text field,
 *   a non-translatable field, and a relationship field targeting `post`.
 * - `note`: titled, versioning off, translatable off.
 * - `snippet`: titleless, statuses off, slug off — the titleField:false testbed.
 * - `card`: titleless with slug capability on — exercises explicit slugs on a
 *   titleless type. Has a relationship field targeting `post` so titled →
 *   titleless and titled → titled incoming relations are both reachable.
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
                fields: [
                    { name: 'body', type: 'text', label: 'Body' },
                    {
                        name: 'category',
                        type: 'text',
                        label: 'Category',
                        translatable: false,
                    },
                    {
                        name: 'related',
                        type: 'relationship',
                        label: 'Related',
                        target: 'post',
                        multiple: true,
                    },
                ],
            },
            note: {
                single: 'Note',
                plural: 'Notes',
                versioning: false,
                translatable: false,
                fields: [{ name: 'body', type: 'text', label: 'Body' }],
            },
            snippet: {
                single: 'Snippet',
                plural: 'Snippets',
                titleField: false,
                statuses: false,
                slug: false,
                fields: [
                    { name: 'key', type: 'text', label: 'Key' },
                    { name: 'value', type: 'text', label: 'Value' },
                ],
            },
            card: {
                single: 'Card',
                plural: 'Cards',
                titleField: false,
                fields: [{ name: 'label', type: 'text', label: 'Label' }],
            },
            bookmark: {
                single: 'Bookmark',
                plural: 'Bookmarks',
                fields: [
                    {
                        name: 'snippet',
                        type: 'relationship',
                        label: 'Snippet',
                        target: 'snippet',
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
    // Mirror initRuntime: the cron runner reads config from this registry, not
    // from `virtual:astromech/config`.
    setRuntimeConfig(resolved);
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
    const row = await db
        .insertInto('users')
        .values(
            encode('users', {
                email: overrides.email ?? `user-${crypto.randomUUID()}@test.dev`,
                name: overrides.name ?? 'Test User',
                ...overrides,
            }) as unknown as Insertable<DB['users']>
        )
        .returningAll()
        .executeTakeFirst();
    if (!row) throw new Error('failed to insert test user');
    return decode('users', row) as unknown as UserRow;
}
