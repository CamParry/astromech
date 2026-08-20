/**
 * `astromech plugin:generate`
 *
 * Run from inside a plugin package: diffs its own `definePluginTable` tables
 * against `migrations/snapshot.json` and writes a migration. No app, no
 * database — never loads `astromech.config.ts`.
 */

import type { Table } from '@/database/define-table';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineCommand } from 'citty';
import { createJiti } from 'jiti';
import { generateMigrations } from '@/database/generate';
import { pluginNamespace, pluginTablePrefix } from '@/plugins/runtime/plugin-identity';

/** Structural check — a `Table`, without importing runtime code. */
function isTable(value: unknown): value is Table {
    return (
        typeof value === 'object' &&
        value !== null &&
        'name' in value &&
        'columns' in value
    );
}

/**
 * Every `Table` a table module exposes: top-level exports plus the values of
 * any exported record. Module export order first, then record key order;
 * duplicates collapse by identity.
 */
function collectTables(mod: Record<string, unknown>): Table[] {
    const seen = new Set<Table>();
    const tables: Table[] = [];

    const add = (table: Table): void => {
        if (seen.has(table)) return;
        seen.add(table);
        tables.push(table);
    };

    for (const exported of Object.values(mod)) {
        if (isTable(exported)) {
            add(exported);
            continue;
        }
        if (
            typeof exported === 'object' &&
            exported !== null &&
            !Array.isArray(exported)
        ) {
            for (const value of Object.values(exported)) {
                if (isTable(value)) add(value);
            }
        }
    }

    return tables;
}

export default defineCommand({
    meta: {
        name: 'plugin:generate',
        description: "Generate migrations for a plugin package's own tables",
    },
    args: {
        tables: {
            type: 'string',
            description: "Path to the module exporting the plugin's tables",
            default: './src/tables/index.ts',
        },
        name: {
            type: 'string',
            description: 'migration name (kebab-case)',
            default: 'migration',
        },
        dir: { type: 'string', description: 'Output directory', default: './migrations' },
        package: {
            type: 'string',
            description:
                "Plugin package name (defaults to the cwd package.json's `name`)",
        },
    },
    async run({ args }) {
        const pkg = args.package ?? (await readPackageName());
        const prefix = pluginTablePrefix(pluginNamespace(pkg));
        const tablesPath = resolve(process.cwd(), args.tables);
        const jiti = createJiti(import.meta.url);
        const mod = (await jiti.import(tablesPath)) as Record<string, unknown>;
        const tables = collectTables(mod);

        if (tables.length === 0) {
            console.error(
                `[astromech plugin:generate] no tables exported from ${tablesPath}. ` +
                    'Export each table declared with `definePluginTable` from that module, ' +
                    'or point --tables at the module that does.'
            );
            process.exit(1);
        }

        // The prefix comes from the PACKAGE, not from whatever the first table
        // happens to be called — a namespace contains underscores, so a table
        // name cannot be parsed back into one unambiguously.
        const offenders = tables
            .filter((table) => !table.name.startsWith(prefix))
            .map((table) => table.name);
        if (offenders.length > 0) {
            console.error(
                `[astromech plugin:generate] every table must be prefixed "${prefix}" ` +
                    `(derived from package "${pkg}"), but these are not: ` +
                    `${offenders.join(', ')}. Declare them with \`definePluginTable(plugin, …)\`, ` +
                    'and keep one table module to one plugin.'
            );
            process.exit(1);
        }

        const dir = resolve(process.cwd(), args.dir);
        const result = await generateMigrations({
            dir,
            tables,
            dialect: 'sqlite',
            name: args.name ?? 'migration',
        });
        if (result.status === 'no-changes') {
            console.log('[astromech plugin:generate] no changes');
        } else {
            console.log(
                `[astromech plugin:generate] generated ${args.dir}/${result.file}`
            );
        }
    },
});

/** The `name` field of the cwd's `package.json` — a plugin's canonical identifier. */
async function readPackageName(): Promise<string> {
    const path = resolve(process.cwd(), 'package.json');
    try {
        const parsed = JSON.parse(await readFile(path, 'utf-8')) as { name?: string };
        if (parsed.name) return parsed.name;
    } catch {
        // Fall through to the shared error below.
    }
    console.error(
        `[astromech plugin:generate] could not read a package name from ${path}. ` +
            'Run this from the plugin package root, or pass --package @scope/name.'
    );
    process.exit(1);
}
