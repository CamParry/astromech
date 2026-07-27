/**
 * `purgePlugin` — the destructive half of `astromech plugin:purge`, driven
 * directly (it is exported DB-in/report-out precisely so it is testable without
 * citty).
 *
 * Two plugins are seeded side by side — tables, `kysely_migration` rows and
 * `_astromech_plugins` rows each — so every assertion is really about the blast
 * radius: everything belonging to the purged package goes, everything belonging
 * to the other one (and to the app itself) stays.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import { createTestDb } from '@tests/harness.js';
import { purgePlugin } from '@/transport/cli/commands/plugin-purge.js';
import type { DB } from '@/database/types.js';

type Db = Kysely<DB>;

/**
 * The harness applies the merged migration chain, so the first-party plugins'
 * own tables exist in every test db. They are not part of these fixtures —
 * filter them out so a `plugin%` assertion describes only what the test seeded.
 */
const HARNESS_PLUGIN_TABLES = ['plugin_redirects_redirects', 'plugin_backups_runs'];

async function tableNames(db: Db, pattern: string): Promise<string[]> {
    const { rows } = await sql<{ name: string }>`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name LIKE ${pattern}
        ORDER BY name
    `.execute(db);
    return rows
        .map((row) => row.name)
        .filter((name) => !HARNESS_PLUGIN_TABLES.includes(name));
}

async function migrationNames(db: Db): Promise<string[]> {
    const { rows } = await sql<{ name: string }>`
        SELECT name FROM kysely_migration ORDER BY name
    `.execute(db);
    return rows.map((row) => row.name);
}

async function trackedPackages(db: Db): Promise<string[]> {
    const rows = await db
        .selectFrom('_astromech_plugins')
        .select('package')
        .orderBy('package')
        .execute();
    return rows.map((row) => row.package);
}

/** Two plugins' worth of tables, migration rows and tracking rows. */
async function seedTwoPlugins(db: Db): Promise<void> {
    for (const table of ['plugin_alpha_runs', 'plugin_alpha_logs', 'plugin_beta_runs']) {
        await sql.raw(`CREATE TABLE ${table} (id text PRIMARY KEY)`).execute(db);
    }
    for (const name of [
        'plugin_alpha_0000_init',
        'plugin_alpha_0001_add-note',
        'plugin_beta_0000_init',
    ]) {
        await sql`
            INSERT INTO kysely_migration (name, timestamp) VALUES (${name}, ${'2026-01-01T00:00:00.000Z'})
        `.execute(db);
    }
    for (const namespace of ['alpha', 'beta']) {
        await sql`
            INSERT INTO _astromech_plugins (package, namespace, version, installed_at)
            VALUES (${`@astromech/${namespace}`}, ${namespace}, ${'1.0.0'}, ${'2026-01-01T00:00:00.000Z'})
        `.execute(db);
    }
}

let db: Db;

beforeEach(async () => {
    db = await createTestDb();
    await seedTwoPlugins(db);
});

describe('purgePlugin', () => {
    it('reports the tables it dropped and the row counts it deleted', async () => {
        const result = await purgePlugin(db, '@astromech/alpha');

        expect(result).toEqual({
            tables: ['plugin_alpha_logs', 'plugin_alpha_runs'],
            migrations: 2,
            tracked: 1,
        });
    });

    it('drops only the purged plugin’s tables', async () => {
        await purgePlugin(db, '@astromech/alpha');

        expect(await tableNames(db, 'plugin%')).toEqual(['plugin_beta_runs']);
    });

    it('deletes only the purged plugin’s kysely_migration rows', async () => {
        const before = await migrationNames(db);
        await purgePlugin(db, '@astromech/alpha');
        const after = await migrationNames(db);

        expect(after).toContain('plugin_beta_0000_init');
        expect(after).not.toContain('plugin_alpha_0000_init');
        expect(after).not.toContain('plugin_alpha_0001_add-note');
        // Every app migration row survives untouched.
        expect(after).toEqual(before.filter((name) => !name.startsWith('plugin_alpha_')));
    });

    it('deletes only the purged plugin’s tracking row', async () => {
        await purgePlugin(db, '@astromech/alpha');

        expect(await trackedPackages(db)).toEqual(['@astromech/beta']);
    });

    it('leaves the app’s own tables alone', async () => {
        await purgePlugin(db, '@astromech/alpha');

        const { rows } = await sql<{ name: string }>`
            SELECT name FROM sqlite_master WHERE type='table' AND name='entries'
        `.execute(db);
        expect(rows).toHaveLength(1);
    });

    it('is a no-op for a package with nothing in the database', async () => {
        const result = await purgePlugin(db, '@astromech/gamma');

        expect(result).toEqual({ tables: [], migrations: 0, tracked: 0 });
        expect(await tableNames(db, 'plugin%')).toEqual([
            'plugin_alpha_logs',
            'plugin_alpha_runs',
            'plugin_beta_runs',
        ]);
        expect(await trackedPackages(db)).toEqual([
            '@astromech/alpha',
            '@astromech/beta',
        ]);
    });

    it('is idempotent — a second purge of the same package reports nothing', async () => {
        await purgePlugin(db, '@astromech/alpha');
        const second = await purgePlugin(db, '@astromech/alpha');

        expect(second).toEqual({ tables: [], migrations: 0, tracked: 0 });
    });

    // Regression: `_` is a single-character wildcard in SQL LIKE, so a
    // `likePrefix` that escaped only wildcards *inside* the namespace and left
    // the separator underscores of `plugin_<ns>_%` bare would make purging
    // `alph` also match `plugin_alpha_*`.
    it('does not touch a plugin whose namespace merely extends the purged one', async () => {
        await sql.raw('CREATE TABLE plugin_alph_runs (id text PRIMARY KEY)').execute(db);

        const result = await purgePlugin(db, '@astromech/alph');

        expect(result.tables).toEqual(['plugin_alph_runs']);
        expect(await tableNames(db, 'plugin%')).toEqual([
            'plugin_alpha_logs',
            'plugin_alpha_runs',
            'plugin_beta_runs',
        ]);
    });
});
