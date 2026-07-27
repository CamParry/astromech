/**
 * `astromech plugin:purge <package>`
 *
 * Removes every trace of an uninstalled plugin from the app's database: its
 * `plugin_<namespace>_*` tables, its `plugin_<namespace>_*` rows in
 * `kysely_migration`, and its `_astromech_plugins` tracking row. Destructive and
 * irreversible — the plugin must already be gone from `astromech.config.ts`,
 * otherwise the next boot would simply recreate everything this dropped.
 *
 * Takes the package name (`@astromech/redirects`), not the namespace: at a
 * destructive call site the canonical identifier is the unambiguous one, and
 * the namespace is derived from it here.
 */

import { defineCommand } from 'citty';
import { sql, type Kysely } from 'kysely';
import { loadConfig, loadRawConfig } from '../config.js';
import { getDb } from '@/database/registry.js';
import { pluginNamespace } from '@/plugins/runtime/plugin-identity.js';
import type { DB } from '@/database/types.js';

export type PurgeResult = {
    /** Dropped table names, in `sqlite_master` order. */
    tables: string[];
    /** `kysely_migration` rows deleted. */
    migrations: number;
    /** `_astromech_plugins` rows deleted. */
    tracked: number;
};

/**
 * The `plugin_<namespace>_%` LIKE pattern, with every literal character escaped.
 *
 * `_` is a single-character wildcard in SQL LIKE, so the two SEPARATOR
 * underscores must be escaped too, not just any inside the namespace: an
 * unescaped `plugin_backup_%` also matches `plugin_backups_runs`, and purging
 * `backup` would irreversibly drop a neighbouring plugin's tables.
 */
function likePrefix(namespace: string): string {
    const escaped = namespace.replace(/[\\%_]/g, '\\$&');
    return `plugin\\_${escaped}\\_%`;
}

function affected(result: { numAffectedRows?: bigint }): number {
    return Number(result.numAffectedRows ?? 0n);
}

/**
 * The purge itself, DB-in/report-out so it can be driven from a test without
 * citty. Assumes the caller has already checked the plugin is uninstalled.
 */
export async function purgePlugin(db: Kysely<DB>, pkg: string): Promise<PurgeResult> {
    const namespace = pluginNamespace(pkg);
    const pattern = likePrefix(namespace);

    // The shared handle runs `CamelCasePlugin`, which snake_cases every
    // identifier node — including the `sql.table()` name we read back out of
    // `sqlite_master`. Drop it so the name we drop is the name that exists.
    const raw = db.withoutPlugins();

    // `sqlite_master` and `kysely_migration` are outside the `DB` interface, so
    // both are queried at the `sql` level rather than cast through Kysely.
    const found = await sql<{ name: string }>`
        select name from sqlite_master
        where type = 'table' and name like ${pattern} escape '\\'
        order by name
    `.execute(raw);

    const tables = found.rows.map((row) => row.name);
    for (const table of tables) {
        await sql`drop table ${sql.table(table)}`.execute(raw);
    }

    const migrations = await sql`
        delete from kysely_migration where name like ${pattern} escape '\\'
    `.execute(raw);

    const tracked = await sql`
        delete from _astromech_plugins where package = ${pkg}
    `.execute(raw);

    return {
        tables,
        migrations: affected(migrations),
        tracked: affected(tracked),
    };
}

export default defineCommand({
    meta: {
        name: 'plugin:purge',
        description: "Drop an uninstalled plugin's tables, migrations and tracking row",
    },
    args: {
        package: {
            type: 'positional',
            required: true,
            description: 'Plugin package name, e.g. @astromech/redirects',
        },
        config: { type: 'string', description: 'Path to astromech.config.ts' },
    },
    async run({ args }) {
        const pkg = args.package;

        // `resolveConfig` strips `plugins`, so the still-installed guard reads the
        // raw config; `loadConfig` is still what initialises the DB.
        const rawConfig = await loadRawConfig(args.config);
        const installed = (rawConfig.plugins ?? []).some(
            (plugin) => plugin.package === pkg
        );
        if (installed) {
            console.error(
                `[astromech plugin:purge] plugin "${pkg}" is still listed in your config. ` +
                    'Remove the plugin from your config first, then re-run this command.'
            );
            process.exit(1);
        }

        await loadConfig(args.config);
        const result = await purgePlugin(getDb(), pkg);

        if (result.tables.length === 0) {
            console.log(`[astromech plugin:purge] no tables found for "${pkg}"`);
        } else {
            for (const table of result.tables) {
                console.log(`[astromech plugin:purge] dropped ${table}`);
            }
        }
        console.log(
            `[astromech plugin:purge] removed ${result.migrations} migration row(s) ` +
                `and ${result.tracked} tracking row(s) for "${pkg}"`
        );
    },
});
