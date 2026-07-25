/**
 * `astromech plugin:generate`
 *
 * Run from inside a plugin package: diffs the plugin's own `definePlugin`
 * descriptors against its `migrations/snapshot.json` and writes a migration into
 * the plugin package's own `migrations/` directory. There is no app and no
 * database here — the schema module is loaded with jiti and nothing else is
 * touched, so this must never load `astromech.config.ts`.
 */

import { defineCommand } from 'citty';
import { createJiti } from 'jiti';
import { resolve } from 'node:path';
import { generateMigrations } from '@/database/generate.js';
import type { TableDescriptor } from '@/database/define-table.js';

const ALIAS_PREFIX = /^plugin_([a-z0-9-]+)_/;

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
 * Every descriptor a schema module exposes: top-level descriptor exports plus
 * the values of any exported record (what `definePlugin` returns). Module export
 * order first, then record key order; duplicates collapse by identity.
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
        schema: {
            type: 'string',
            description: 'Path to the schema module',
            default: './src/schema/index.ts',
        },
        name: {
            type: 'string',
            description: 'migration name (kebab-case)',
            default: 'migration',
        },
        dir: { type: 'string', description: 'Output directory', default: './migrations' },
    },
    async run({ args }) {
        const schemaPath = resolve(process.cwd(), args.schema);
        const jiti = createJiti(import.meta.url);
        const mod = (await jiti.import(schemaPath)) as Record<string, unknown>;
        const tables = collectDescriptors(mod);

        if (tables.length === 0) {
            console.error(
                `[astromech plugin:generate] no defineTable descriptors exported from ${schemaPath}. ` +
                    'Export the record returned by `definePlugin` (or the individual tables) ' +
                    'from that module, or point --schema at the module that does.'
            );
            process.exit(1);
        }

        const firstName = tables[0]?.name ?? '';
        const match = ALIAS_PREFIX.exec(firstName);
        if (!match) {
            console.error(
                `[astromech plugin:generate] table "${firstName}" is not namespaced. ` +
                    'Plugin tables must be declared via `definePlugin({ alias, schema })`, ' +
                    'which names them `plugin_<alias>_<table>`.'
            );
            process.exit(1);
        }

        const prefix = `plugin_${match[1] ?? ''}_`;
        const offenders = tables
            .filter((table) => !table.name.startsWith(prefix))
            .map((table) => table.name);
        if (offenders.length > 0) {
            console.error(
                `[astromech plugin:generate] every table in ${schemaPath} must share the ` +
                    `"${prefix}" prefix (taken from "${firstName}"), but these do not: ` +
                    `${offenders.join(', ')}. One schema module declares one plugin's tables.`
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
