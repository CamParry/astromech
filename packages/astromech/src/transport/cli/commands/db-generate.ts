/**
 * `astromech db:generate`
 *
 * Orchestrates drizzle-kit migration generation for an Astromech app.
 *
 * Workflow:
 * 1. Load the app config (no DB connection required).
 * 2. Collect schema specifiers: core (`astromech/db/schema`) + each plugin's
 *    `schemaModule`. Plugins with a `schema` object but no `schemaModule` emit
 *    a warning — their tables cannot be included.
 * 3. Codegen `.astromech/drizzle.schema.ts` and `.astromech/drizzle.config.ts`
 *    in the app's working directory.
 * 4. Spawn `npx drizzle-kit generate --config .astromech/drizzle.config.ts`.
 */

import { defineCommand } from 'citty';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadRawConfig } from '../config.js';

// ============================================================================
// Pure builder functions (unit-testable)
// ============================================================================

/**
 * Build the combined schema module that re-exports all table specifiers.
 * Each specifier becomes one `export * from '...'` line.
 */
export function buildCombinedSchemaModule(specifiers: string[]): string {
    return specifiers.map((s) => `export * from '${s}';`).join('\n') + '\n';
}

/**
 * Build a drizzle-kit config that points at the generated schema file and
 * the app's drizzle output directory.
 *
 * `schemaPath` — path to the schema module as seen from the app's CWD
 * (drizzle-kit resolves schema relative to CWD, not the config file).
 * `dbUrl` — database credentials URL; falls back to `process.env.DATABASE_URL`
 * at runtime, then the provided default.
 */
export function buildDrizzleConfig(opts: {
    schemaPath: string;
    dbUrlDefault: string;
}): string {
    return [
        `import { defineConfig } from 'drizzle-kit';`,
        ``,
        `export default defineConfig({`,
        `    dialect: 'sqlite',`,
        `    schema: '${opts.schemaPath}',`,
        `    out: './drizzle',`,
        `    dbCredentials: {`,
        `        url: process.env.DATABASE_URL ?? '${opts.dbUrlDefault}',`,
        `    },`,
        `});`,
        ``,
    ].join('\n');
}

// ============================================================================
// Command
// ============================================================================

export default defineCommand({
    meta: {
        name: 'db:generate',
        description:
            'Generate drizzle-kit migrations for this app (core + plugin schemas)',
    },
    args: {
        config: { type: 'string', description: 'Path to astromech.config.ts' },
    },
    async run({ args }) {
        // Raw config only — no DB connection needed for schema generation.
        const rawConfig = await loadRawConfig(args.config);

        // ── Collect schema specifiers ──────────────────────────────────────
        const CORE_SCHEMA = 'astromech/db/schema';
        const specifiers: string[] = [CORE_SCHEMA];

        for (const plugin of rawConfig.plugins ?? []) {
            if (plugin.schemaModule) {
                specifiers.push(plugin.schemaModule);
            } else if (plugin.schema && plugin.schema.length > 0) {
                const name = plugin.alias ?? plugin.name ?? plugin.package;
                console.warn(
                    `[astromech db:generate] Warning: plugin "${name}" has schema tables but no ` +
                        `schemaModule. Set schemaModule on its PluginDefinition (e.g. ` +
                        `'${plugin.package}/schema') so its tables are included in migrations.`
                );
            }
        }

        // ── Codegen .astromech/ ────────────────────────────────────────────
        const astromechDir = resolve(process.cwd(), '.astromech');
        await mkdir(astromechDir, { recursive: true });

        const schemaFileContent = buildCombinedSchemaModule(specifiers);
        const schemaFilePath = resolve(astromechDir, 'drizzle.schema.ts');
        await writeFile(schemaFilePath, schemaFileContent, 'utf-8');

        const configContent = buildDrizzleConfig({
            schemaPath: './.astromech/drizzle.schema.ts',
            dbUrlDefault: 'file:./database.db',
        });
        const configFilePath = resolve(astromechDir, 'drizzle.config.ts');
        await writeFile(configFilePath, configContent, 'utf-8');

        console.log(
            `[astromech db:generate] Schema specifiers: ${specifiers.join(', ')}`
        );
        console.log(`[astromech db:generate] Wrote .astromech/drizzle.schema.ts`);
        console.log(`[astromech db:generate] Wrote .astromech/drizzle.config.ts`);

        // ── Spawn drizzle-kit generate ─────────────────────────────────────
        console.log(`[astromech db:generate] Running drizzle-kit generate...`);
        const result = spawnSync(
            'npx',
            ['drizzle-kit', 'generate', '--config', '.astromech/drizzle.config.ts'],
            { stdio: 'inherit', cwd: process.cwd() }
        );

        if (result.status !== 0) {
            process.exit(result.status ?? 1);
        }
    },
});
