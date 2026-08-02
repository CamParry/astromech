/**
 * `astromech plugin:generate`
 *
 * Run from inside a plugin package: diffs the plugin's own `definePluginTable`
 * descriptors against its `migrations/snapshot.json` and writes a migration into
 * the plugin package's own `migrations/` directory. There is no app and no
 * database here — the table module is loaded with jiti and nothing else is
 * touched, so this must never load `astromech.config.ts`.
 */

import { defineCommand } from 'citty';
import { createJiti } from 'jiti';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { generateMigrations } from '@/database/generate.js';
import { pluginNamespace, pluginTablePrefix } from '@/plugins/runtime/plugin-identity.js';
import type { TableDescriptor } from '@/database/define-table.js';

/** Structural check — a `defineTable` descriptor, without importing runtime code. */
function isDescriptor(value: unknown): value is TableDescriptor {
    return (
        typeof value === 'object' &&
        value !== null &&
        'name' in value &&
        'columns' in value
    );
}

/**
 * Every descriptor a table module exposes: top-level descriptor exports plus
 * the values of any exported record. Module export order first, then record key
 * order; duplicates collapse by identity.
 */
function collectDescriptors(mod: Record<string, unknown>): TableDescriptor[] {
    const seen = new Set<TableDescriptor>();
    const tables: TableDescriptor[] = [];

    const add = (table: TableDescriptor): void => {
        if (seen.has(table)) return;
        seen.add(table);
        tables.push(table);
    };

    for (const exported of Object.values(mod)) {
        if (isDescriptor(exported)) {
            add(exported);
            continue;
        }
        if (
            typeof exported === 'object' &&
            exported !== null &&
            !Array.isArray(exported)
        ) {
            for (const value of Object.values(exported)) {
                if (isDescriptor(value)) add(value);
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
            description: "Path to the module exporting the plugin's table descriptors",
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
        const tables = collectDescriptors(mod);

        if (tables.length === 0) {
            console.error(
                `[astromech plugin:generate] no defineTable descriptors exported from ${tablesPath}. ` +
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
