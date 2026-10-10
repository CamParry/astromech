/**
 * Test harness for the entry data layer.
 *
 * `createTestDb` copies the run's template database (migrated once by
 * `global-setup.ts` with the full chain in `test-db.ts`) to a new file in the
 * run's temp dir, opens it with the `libsql` driver a site runs, and registers
 * it via `setDb` so service modules (which call `getDb()` per-op) hit it. A
 * copy takes a few milliseconds where migrating takes tens, so a fresh database
 * per test is cheap. `setupTestConfig` resolves a small but representative
 * config, publishes it to `config/registry.ts`, and registers its drivers with
 * `registerDrivers`, the function boot calls.
 *
 * Why file-based rather than `:memory:`?
 * On a file database, `@libsql/client` keeps a pool of connections: a
 * transaction holds one of them and other queries use the rest, which is how a
 * site runs. A `:memory:` database has a single connection, so while a
 * transaction is open, any query outside it fails with `TRANSACTION_ACTIVE`
 * instead of running. The suite passes on either; the file keeps it on the
 * connection behaviour a site has, and a file is what the template copy needs.
 *
 * Each `createTestDb()` call uses a unique file name so `beforeEach` calls stay
 * fully isolated even when tests run in a single worker. It starts with
 * `resetRuntime()`, so every global registry is empty, as boot finds it, and
 * no test file resets one by hand. Files that share a worker's module graph
 * cannot see one another's drivers, hooks, cron jobs or Better Auth instance.
 *
 * FK enforcement: libsql enables `PRAGMA foreign_keys` by default. Entry
 * inserts still leave `createdBy`/`updatedBy` null, but a version snapshot
 * records the acting user, so a route test acting as `testUser` needs that row
 * to exist — `mount-router.ts`'s `seedTestUser` inserts it via `createTestUser`.
 */
import type { Table } from '@/database/define-table';
import type { UserTableRow } from '@/database/tables';
import type { DB } from '@/database/types';
import type {
    AppContext,
    AstromechConfig,
    DatabaseDriver,
    EntryType,
    JsonObject,
    PluginDefinition,
    ResolvedConfig,
    Role,
    StorageDriver,
    User,
} from '@/types/index';
// Declares `testDbDir` and `testDbTemplate` on vitest's `ProvidedContext`,
// for `inject` below.
import type {} from './global-setup';
import type { Kysely } from 'kysely';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { noopStorage } from '@tests/fixtures';
import { testMigrationProvider } from '@tests/test-db';
import { sql } from 'kysely';
import { inject } from 'vitest';
import { createAppContext } from '@/app-context/app-context';
import { setConfig } from '@/config/registry';
import { resolveConfig } from '@/config/resolve';
import { decodeWith, encodeWith } from '@/database/codec';
import { getDatabaseDriver, setDatabaseDriver } from '@/database/driver-registry';
import { libsql } from '@/database/drivers/libsql';
import { setMigrationProvider } from '@/database/migration-registry';
import { getDb, setDb } from '@/database/registry';
import { userContentTable, usersTable } from '@/database/tables';
import { DEFAULT_ROLE_SLUG } from '@/permissions/roles';
import { registerPlugins } from '@/plugins/runtime/plugin-runtime';
import { registerDrivers } from '@/register-drivers';
import { runInRequestScope } from '@/request-scope/request-scope';
import { filesystem } from '@/storage/drivers/filesystem';

type Db = Kysely<DB>;

// Written by `global-setup.ts`, which removes both once every worker has
// finished: the run's temp dir for test databases, and the migrated template
// each test database is copied from. A vitest project without that global setup
// gets `undefined` for both, which `testDbPaths()` reports by name.
const TEST_DB_DIR: string | undefined = inject('testDbDir');
const TEST_DB_TEMPLATE: string | undefined = inject('testDbTemplate');

function testDbPaths(): { dir: string; template: string } {
    if (TEST_DB_DIR === undefined || TEST_DB_TEMPLATE === undefined) {
        throw new Error(
            "the test database needs core's global setup " +
                '(packages/astromech/tests/_support/global-setup.ts), which this ' +
                'vitest project does not list in `globalSetup`'
        );
    }
    return { dir: TEST_DB_DIR, template: TEST_DB_TEMPLATE };
}

/**
 * Reset the runtime with `resetRuntime()`, then copy the migrated template to
 * a new file, open it through the `libsql` driver, and register it globally,
 * with the migration chain the template was built from. Returns the Kysely handle (already the active `getDb()` instance).
 */
export async function createTestDb(): Promise<Db> {
    const { dir, template } = testDbPaths();
    resetRuntime();
    const file = path.join(dir, `${crypto.randomUUID()}.db`);
    await fs.copyFile(template, file);
    const driver = libsql({ url: `file:${file}` });
    setDb(driver.getInstance());
    setDatabaseDriver(driver);
    setMigrationProvider(testMigrationProvider);
    return driver.getInstance();
}

/**
 * The `filesystem` storage driver over a new directory in the run's temp dir,
 * which global setup removes, serving public URLs under `urlPrefix` when given.
 * For a test that reads a file back; one that never does keeps `noopStorage`.
 */
export function createTestStorage(options: { urlPrefix?: string } = {}): StorageDriver {
    return filesystem({
        dir: path.join(testDbPaths().dir, `storage-${crypto.randomUUID()}`),
        ...options,
    });
}

/**
 * Return every global registry to the state boot finds it in: an empty
 * `globalThis.__astromech`, which each registry refills on first use. The
 * in-process cron ticker is stopped first, because its handle lives there.
 */
export function resetRuntime(): void {
    const ticker = globalThis.__astromech?.cronInterval;
    if (ticker !== undefined) clearInterval(ticker);
    globalThis.__astromech = undefined;
}

/**
 * `makeTestConfig()`'s database. It stands for the one `createTestDb()` opened,
 * which `setupTestConfig()` registers in its place.
 */
const testDatabase: DatabaseDriver = {
    name: 'test',
    getInstance(): Kysely<DB> {
        throw new Error('the test config has no database of its own');
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
export function makeTestConfig(): TestConfig {
    return {
        db: testDatabase,
        storage: noopStorage,
        defaultLocale: 'en',
        locales: ['en', 'de'],
        entries: [
            {
                type: 'post',
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
            {
                type: 'note',
                single: 'Note',
                plural: 'Notes',
                versioning: false,
                translatable: false,
                fields: [{ name: 'body', type: 'text', label: 'Body' }],
            },
            {
                type: 'snippet',
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
            {
                type: 'card',
                single: 'Card',
                plural: 'Cards',
                titleField: false,
                fields: [{ name: 'label', type: 'text', label: 'Label' }],
            },
            {
                type: 'bookmark',
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
        ],
    };
}

/** An authored config whose `entries` is always present, for a test to read or extend. */
type TestConfig = AstromechConfig & { entries: EntryType[] };

/**
 * The entry type `type` in `config`, for a test to read or change in place.
 * Throws when the config has no such type.
 */
export function getEntryType(config: AstromechConfig, type: string): EntryType {
    const entryType = config.entries?.find((candidate) => candidate.type === type);
    if (entryType === undefined) {
        throw new Error(`the test config has no entry type "${type}"`);
    }
    return entryType;
}

/**
 * `entries` with each of `entryTypes` in place of the type with the same
 * `type`, or appended when there is none.
 */
export function withEntryTypes(
    entries: EntryType[] | undefined,
    ...entryTypes: EntryType[]
): EntryType[] {
    const replaced = (entries ?? []).map(
        (entryType) =>
            entryTypes.find((candidate) => candidate.type === entryType.type) ?? entryType
    );
    const added = entryTypes.filter(
        (candidate) => !replaced.some((entryType) => entryType.type === candidate.type)
    );
    return [...replaced, ...added];
}

/**
 * `makeTestConfig()` with the `libsql` driver `createTestDb()` opened as its
 * database, for a test that feeds a raw config through the real boot rather
 * than `setupTestConfig`. Call it before anything resets the runtime.
 */
export function makeBootConfig(): AstromechConfig {
    return { ...makeTestConfig(), db: openedDb() };
}

/**
 * Resolve `makeTestConfig()` with `overrides` laid over it, for code that takes
 * a `ResolvedConfig` as an argument. The config is not published, but
 * `resolveConfig` still sets the plugin field types globally.
 */
export function resolveTestConfig(
    overrides: Partial<AstromechConfig> = {}
): ResolvedConfig {
    return resolveConfig({ ...makeTestConfig(), ...overrides });
}

/**
 * Resolve the test config, publish it and register its drivers, the way boot
 * does. The database is the one `createTestDb()` opened unless the config names
 * its own. Also resets the plugin runtime (no hooks) unless `plugins` is supplied.
 */
export function setupTestConfig(
    config: AstromechConfig = makeTestConfig()
): ResolvedConfig {
    const resolved = resolveConfig(config);
    setConfig(resolved);
    registerDrivers({
        ...config,
        db: config.db === testDatabase ? openedDb() : config.db,
    });
    registerPlugins(config.plugins ?? []);
    return resolved;
}

/** The database driver `createTestDb()` registered. Throws when there is none. */
function openedDb(): DatabaseDriver {
    const driver = getDatabaseDriver();
    if (driver === null) {
        throw new Error(
            'setupTestConfig() needs a database: call createTestDb() first, or pass `db` in the config'
        );
    }
    return driver;
}

/**
 * Run `fn` with `user` as the request-scoped identity. Seeding `user` means no
 * session resolve happens; tests that need no identity need no reset, because
 * outside a scope there simply is no user.
 */
export function runAsUser<T>(user: User | null, fn: () => T): T {
    return runInRequestScope(
        { request: new Request('http://localhost/'), user, role: null },
        fn
    );
}

/**
 * Send `init` to `path` on `app` as `user` under `role`. It opens the request
 * scope with the identity already set, which the app joins, so the route skips
 * the session resolve. The Astro middleware opens the scope with the request
 * only and the session is resolved later; only `request-scope.test.ts` covers
 * that path.
 */
export function requestAs(
    app: { fetch(request: Request): Response | Promise<Response> },
    identity: { user: User | null; role: Role | null },
    path: string,
    init?: RequestInit
): Promise<Response> {
    const request = new Request(new URL(path, 'http://localhost'), init);
    return runInRequestScope({ request, ...identity }, async () => app.fetch(request));
}

/**
 * Make every `operation` on `table` fail with the message `boom` until the
 * returned function drops the trigger. The failure is raised inside the write's
 * own transaction, as a constraint violation would be. A `TEMP` trigger would
 * reach only the pooled connection that created it, so this one is not.
 */
export async function failWritesTo(
    table: Table,
    operation: 'insert' | 'update' | 'delete'
): Promise<() => Promise<void>> {
    const db = getDb();
    const trigger = `fail_${table.name}_${operation}`;
    await sql
        .raw(
            `CREATE TRIGGER ${trigger} BEFORE ${operation.toUpperCase()} ON ${table.name} ` +
                `BEGIN SELECT RAISE(ABORT, 'boom'); END`
        )
        .execute(db);
    return async () => {
        await sql.raw(`DROP TRIGGER ${trigger}`).execute(db);
    };
}

/**
 * A context acting as `role` and `user`, the way a transport builds one for a
 * caller. No user by default, so a write records no author row to reference.
 */
export function contextAs(role: Role | null, user: User | null = null): AppContext {
    return createAppContext({ user, role });
}

/** Register a probe plugin's hooks against the live runtime. */
export function registerTestPlugins(plugins: PluginDefinition[]): void {
    registerPlugins(plugins);
}

/**
 * Insert a user row and its content row (entries reference users via nullable
 * FKs), and return the user as the users service answers it. `fields` and
 * `locale` go on the content row; `locale` defaults to `en` rather than reading
 * the config, because a route test seeds its acting user before
 * `setupTestConfig` runs. Throws when either insert returns no row.
 */
export async function createTestUser(
    db: Db,
    overrides: Partial<UserTableRow> & { fields?: JsonObject; locale?: string } = {}
): Promise<User> {
    const { fields, locale, ...account } = overrides;
    const row = await db
        .insertInto('users')
        .values(
            encodeWith(usersTable, {
                email: account.email ?? `user-${crypto.randomUUID()}@test.dev`,
                name: account.name ?? 'Test User',
                role: account.role ?? DEFAULT_ROLE_SLUG,
                ...account,
            })
        )
        .returningAll()
        .executeTakeFirst();
    if (!row) throw new Error('failed to insert test user');
    const user = decodeWith(usersTable, row);

    const contentRow = await db
        .insertInto('userContent')
        .values(
            encodeWith(userContentTable, {
                userId: user.id,
                locale: locale ?? 'en',
                fields: fields ?? {},
            })
        )
        .returningAll()
        .executeTakeFirst();
    if (!contentRow) throw new Error('failed to insert test user content');
    const content = decodeWith(userContentTable, contentRow);

    return {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
        image: user.image,
        locale: content.locale,
        locales: [content.locale],
        // The `fields` column decodes as `unknown`; mapped as the users
        // repository maps it.
        fields: (content.fields ?? {}) as JsonObject,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
    };
}
