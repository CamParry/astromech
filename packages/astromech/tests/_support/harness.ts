/**
 * Test harness for the entry data layer.
 *
 * `createTestDb` spins up a file-based libsql database in the OS temp dir,
 * applies `apps/demo/migrations`' full migration chain, and registers it via
 * `setDb` so service modules (which call `getDb()` per-op) hit it. Running the real
 * migration chain (rather than a throwaway test-only schema) means every
 * harness-based test also exercises the generated `migrationProvider`.
 * `setupTestConfig` resolves a small but representative config and publishes it
 * to `config/registry.ts`, which is where every reader takes it from.
 *
 * Why file-based rather than `:memory:`?
 * libsql's `client.transaction()` hands the underlying SQLite connection to the
 * transaction and nulls out the client's stored reference. The client lazily
 * creates a NEW connection on next use: for `:memory:` that new connection is a
 * blank database, so any read after a database transaction throws "no such
 * table"; for a file path it reopens the same file and sees the committed data.
 * Entry `create`, `mergeStaged` and the bulk operations all run in transactions,
 * so a `:memory:` default would poison most of the suite. File-backed temp DBs
 * keep transaction semantics correct and stay effectively as fast for the small
 * migration set here.
 *
 * Each `createTestDb()` call uses a unique file name so `beforeEach` calls stay
 * fully isolated even when tests run in a single worker.
 *
 * FK enforcement: libsql enables `PRAGMA foreign_keys` by default. Entry
 * inserts still leave `createdBy`/`updatedBy` null, but a version snapshot
 * records the acting user, so a route test acting as `testUser` needs that row
 * to exist — `mount-router.ts`'s `seedTestUser` inserts it via `createTestUser`.
 */
import type { UserRow } from '@/database/tables';
import type { DB } from '@/database/types';
import type {
    AstromechConfig,
    DatabaseDriver,
    PluginDefinition,
    ResolvedConfig,
    StorageDriver,
    StorageList,
    User,
} from '@/types/index';
import type { Dialect, MigrationProvider } from 'kysely';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { mergeMigrationProviders, migrateToLatest } from '@astromech/schema-engine';
import { createClient } from '@libsql/client';
import { LibsqlDialect } from '@libsql/kysely-libsql';
import { CamelCasePlugin, Kysely } from 'kysely';
import { setConfig } from '@/config/registry';
import { resolveConfig } from '@/config/resolve';
import { decodeWith, encodeWith } from '@/database/codec';
import { setDatabaseDriver } from '@/database/driver-registry';
import { setDb } from '@/database/registry';
import { usersTable } from '@/database/tables';
import { DEFAULT_ROLE_SLUG } from '@/permissions/roles';
import { registerPlugins } from '@/plugins/runtime/plugin-runtime';
import { runWithContext } from '@/request-context/request-context';

type Db = Kysely<DB>;

/** Plugins whose generated baselines the harness chain includes. */
export const FIRST_PARTY_PLUGIN_MIGRATIONS = ['redirects', 'backups', 'forms'] as const;

/**
 * Build a Kysely instance over a libsql `url`, register it (+ a driver wrapping
 * it) globally, and apply the full migration chain. The app-owned migration
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
    setDatabaseDriver({
        type: 'libsql',
        getInstance: () => db,
        createDialect: () => new LibsqlDialect({ client: client as never }),
        supportsTransactions: true,
    });
    const { migrationProvider } = await import(
        new URL('../../../../apps/demo/migrations/index.ts', import.meta.url).href
    );
    // The first-party plugins own their tables now, so the app chain alone no
    // longer creates them. Apply exactly what a real boot applies: the merged
    // provider. `allowUnorderedMigrations` mirrors `boot/boot.ts` — plugin
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

// Temp dir for test databases — created once per worker process and removed by
// the exit handler below. The worker PID in the name avoids collisions when
// several workers run in parallel.
const TEST_DB_DIR = fs.mkdtempSync(
    path.join(os.tmpdir(), `astromech-test-${process.pid}-`)
);
process.on('exit', () => fs.rmSync(TEST_DB_DIR, { recursive: true, force: true }));

/**
 * Create a fresh temp-file database, migrate it, and register it globally.
 * Returns the Kysely handle (already the active `getDb()` instance).
 */
export async function createTestDb(): Promise<Db> {
    return buildTestDb(`file:${path.join(TEST_DB_DIR, `${crypto.randomUUID()}.db`)}`);
}

/**
 * Like {@link createTestDb} but against a caller-named file db (e.g.
 * `file:/tmp/x.db`), for tests that want to inspect or clean up the file.
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
    async stat(): Promise<null> {
        return null;
    },
    async delete(): Promise<void> {
        return undefined;
    },
    async list(): Promise<StorageList> {
        return { keys: [] };
    },
    getPublicUrl(key: string): string | null {
        return `/${key}`;
    },
};

// `makeTestConfig()`'s `db` field is never actually resolved: tests wire the
// active driver themselves via `createTestDb()` → `setDatabaseDriver`, and
// `setupTestConfig()` never reads `config.db`. This just satisfies the type.
const noopDriver: DatabaseDriver = {
    type: 'test',
    getInstance(): Kysely<DB> {
        throw new Error('test driver getInstance should not be called');
    },
    createDialect(): Dialect {
        throw new Error('test driver createDialect should not be called');
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
 * Resolve the test config and publish it, the way the boot lifecycle does. Also
 * resets the plugin runtime (no hooks) unless `plugins` is supplied.
 */
export function setupTestConfig(
    config: AstromechConfig = makeTestConfig()
): ResolvedConfig {
    const resolved = resolveConfig(config);
    setConfig(resolved);
    registerPlugins(config.plugins ?? [], resolved);
    return resolved;
}

/**
 * Run `fn` with `user` as the request-scoped identity. Seeding `user` means no
 * session resolve happens; tests that need no identity need no reset, because
 * outside a scope there simply is no user.
 */
export function runAsUser<T>(user: User | null, fn: () => T): T {
    return runWithContext(
        { request: new Request('http://localhost/'), user, role: null },
        fn
    );
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
            encodeWith(usersTable, {
                email: overrides.email ?? `user-${crypto.randomUUID()}@test.dev`,
                name: overrides.name ?? 'Test User',
                role: overrides.role ?? DEFAULT_ROLE_SLUG,
                ...overrides,
            })
        )
        .returningAll()
        .executeTakeFirst();
    if (!row) throw new Error('failed to insert test user');
    return decodeWith(usersTable, row);
}
