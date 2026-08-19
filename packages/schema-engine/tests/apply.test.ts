/**
 * Tests for the migration runner (`src/apply.ts`).
 *
 * Applies a two-migration provider to a real libsql db (plain DDL, so
 * `:memory:` is fine) and checks that a failing migration surfaces its name.
 * The merged app+plugin chain runs against a temp FILE db instead: Kysely's
 * migrator commits in a transaction, and a `:memory:` db is poisoned for reads
 * afterwards.
 */
import type { MigrationProvider } from 'kysely';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@libsql/client';
import { LibsqlDialect } from '@libsql/kysely-libsql';
import { Kysely, sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { mergeMigrationProviders, migrateToLatest } from '../src/apply';
import { dumpSchema } from '../src/oracle';

function makeDb(): Kysely<unknown> {
    const client = createClient({ url: ':memory:' });
    return new Kysely<unknown>({
        dialect: new LibsqlDialect({ client: client as never }),
    });
}

async function withTempFileDb(
    fn: (open: () => Kysely<unknown>) => Promise<void>
): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), 'schema-engine-apply-'));
    const url = pathToFileURL(join(dir, 'test.db')).href;
    try {
        await fn(() => {
            const client = createClient({ url });
            return new Kysely<unknown>({
                dialect: new LibsqlDialect({ client: client as never }),
            });
        });
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

const twoMigrations: MigrationProvider = {
    async getMigrations() {
        return {
            '0000_init': {
                async up(db: Kysely<unknown>) {
                    await sql`CREATE TABLE \`widgets\` (\`id\` text PRIMARY KEY NOT NULL)`.execute(
                        db
                    );
                },
            },
            '0001_add-note': {
                async up(db: Kysely<unknown>) {
                    await sql`ALTER TABLE \`widgets\` ADD COLUMN \`note\` text`.execute(
                        db
                    );
                },
            },
        };
    },
};

describe('migrateToLatest', () => {
    it('applies every migration in the provider, in order', async () => {
        const db = makeDb();
        await migrateToLatest(db, twoMigrations);

        const rows = await dumpSchema(db, { tables: ['widgets'] });
        expect(rows).toHaveLength(1);
        expect(rows[0]?.sql).toContain('`note` text');
    });

    it('is idempotent — a second run applies nothing new', async () => {
        const db = makeDb();
        await migrateToLatest(db, twoMigrations);
        await expect(migrateToLatest(db, twoMigrations)).resolves.toBeUndefined();
    });

    it('surfaces the failing migration by name', async () => {
        const db = makeDb();
        const broken: MigrationProvider = {
            async getMigrations() {
                return {
                    '0000_broken': {
                        async up(inner: Kysely<unknown>) {
                            await sql`CREATE TABLE \`widgets\` (nonsense`.execute(inner);
                        },
                    },
                };
            },
        };

        await expect(migrateToLatest(db, broken)).rejects.toThrow(/0000_broken/);
    });
});

function makeTableProvider(table: string): MigrationProvider {
    return {
        async getMigrations() {
            return {
                '0000_init': {
                    async up(db: Kysely<unknown>) {
                        await sql
                            .raw(
                                `CREATE TABLE \`${table}\` (\`id\` text PRIMARY KEY NOT NULL)`
                            )
                            .execute(db);
                    },
                },
            };
        },
    };
}

describe('mergeMigrationProviders', () => {
    it('keeps app migration names bare and prefixes plugin ones with plugin_<alias>_', async () => {
        const merged = mergeMigrationProviders(twoMigrations, [
            { alias: 'blog', provider: makeTableProvider('blog_posts') },
            { alias: 'shop', provider: makeTableProvider('shop_orders') },
        ]);

        expect(Object.keys(await merged.getMigrations()).sort()).toEqual([
            '0000_init',
            '0001_add-note',
            'plugin_blog_0000_init',
            'plugin_shop_0000_init',
        ]);
    });

    it('throws when a plugin key collides with an app migration name', async () => {
        const app: MigrationProvider = {
            async getMigrations() {
                return {
                    plugin_blog_0000_init: {
                        async up(db: Kysely<unknown>) {
                            await sql`CREATE TABLE \`clash\` (\`id\` text PRIMARY KEY NOT NULL)`.execute(
                                db
                            );
                        },
                    },
                };
            },
        };
        const merged = mergeMigrationProviders(app, [
            { alias: 'blog', provider: makeTableProvider('blog_posts') },
        ]);

        await expect(merged.getMigrations()).rejects.toThrow(
            /duplicate migration "plugin_blog_0000_init".*plugin "blog".*the app/
        );
    });

    it('throws when two plugins produce the same key', async () => {
        const merged = mergeMigrationProviders(twoMigrations, [
            { alias: 'blog', provider: makeTableProvider('blog_posts') },
            { alias: 'blog', provider: makeTableProvider('blog_tags') },
        ]);

        await expect(merged.getMigrations()).rejects.toThrow(
            /duplicate migration "plugin_blog_0000_init".*plugin "blog"/
        );
    });

    /**
     * `plugin_` sorts after every `NNNN_` app migration, so an out-of-order
     * chain needs a second plugin: install `zeta` first, then `alpha`, whose
     * key sorts before the already-executed `plugin_zeta_0000_init`.
     */
    it('applies a plugin migration that sorts before an executed one when unordered migrations are allowed', async () => {
        await withTempFileDb(async (open) => {
            const withZeta = mergeMigrationProviders(twoMigrations, [
                { alias: 'zeta', provider: makeTableProvider('zeta_things') },
            ]);
            await migrateToLatest(open(), withZeta, {
                allowUnorderedMigrations: true,
            });

            const withAlpha = mergeMigrationProviders(twoMigrations, [
                { alias: 'zeta', provider: makeTableProvider('zeta_things') },
                { alias: 'alpha', provider: makeTableProvider('alpha_things') },
            ]);
            await migrateToLatest(open(), withAlpha, {
                allowUnorderedMigrations: true,
            });

            const db = open();
            const rows = await dumpSchema(db, { tables: ['alpha_things'] });
            expect(rows).toHaveLength(1);

            const { rows: applied } = await sql<{ name: string }>`
                SELECT name FROM kysely_migration ORDER BY name
            `.execute(db);
            expect(applied.map((it) => it.name)).toContain('plugin_alpha_0000_init');
        });
    });

    it('rejects the same out-of-order chain when unordered migrations are not allowed', async () => {
        await withTempFileDb(async (open) => {
            const withZeta = mergeMigrationProviders(twoMigrations, [
                { alias: 'zeta', provider: makeTableProvider('zeta_things') },
            ]);
            await migrateToLatest(open(), withZeta, {
                allowUnorderedMigrations: true,
            });

            const withAlpha = mergeMigrationProviders(twoMigrations, [
                { alias: 'zeta', provider: makeTableProvider('zeta_things') },
                { alias: 'alpha', provider: makeTableProvider('alpha_things') },
            ]);
            await expect(migrateToLatest(open(), withAlpha)).rejects.toThrow(
                /corrupted migrations/
            );
        });
    });
});
