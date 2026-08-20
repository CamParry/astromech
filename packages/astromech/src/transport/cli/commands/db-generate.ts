/**
 * `astromech db:generate`
 *
 * Diffs the core tables against `migrations/snapshot.json` and writes a new
 * migration if anything changed. Plugin-owned tables are generated separately
 * via `astromech plugin:generate`; this covers `CORE_TABLES` only.
 */

import type { MigrationOpsAuthor } from '@/database/generate';
import { resolve } from 'node:path';
import { defineCommand } from 'citty';
import { createJiti } from 'jiti';
import { generateMigrations, generateMigrationsFromOps } from '@/database/generate';
import { CORE_TABLES } from '@/database/tables';
import { loadConfig } from '../config';
import { allowRemoteArgs, toAllowRemoteOption } from '../remote-args';

/** Load an ops file's default export, failing loudly if it is not a function. */
async function loadOpsAuthor(path: string): Promise<MigrationOpsAuthor> {
    const jiti = createJiti(import.meta.url);
    const mod = (await jiti.import(resolve(process.cwd(), path))) as {
        default?: unknown;
    };
    if (typeof mod.default !== 'function') {
        throw new Error(
            `[astromech db:generate] --ops file "${path}" must default-export a function ` +
                `({ prev, next, dialect }) => TableOp[]`
        );
    }
    return mod.default as MigrationOpsAuthor;
}

export default defineCommand({
    meta: {
        name: 'db:generate',
        description: 'Generate migrations for this app (core + plugin schemas)',
    },
    args: {
        config: { type: 'string', description: 'Path to astromech.config.ts' },
        ...allowRemoteArgs,
        name: { type: 'string', description: 'migration name (kebab-case)' },
        ops: {
            type: 'string',
            description:
                'Path to a file default-exporting hand-authored migration ops ' +
                '(only for transitions the differ refuses)',
        },
    },
    async run({ args }) {
        await loadConfig(args.config, toAllowRemoteOption(args));
        const common = {
            dir: resolve(process.cwd(), 'migrations'),
            tables: CORE_TABLES,
            dialect: 'sqlite' as const,
            name: args.name ?? 'migration',
        };

        const result = args.ops
            ? await generateMigrationsFromOps({
                  ...common,
                  author: await loadOpsAuthor(args.ops),
              })
            : await generateMigrations(common);

        if (result.status === 'no-changes') {
            console.log('[astromech db:generate] no changes');
        } else {
            console.log(`[astromech db:generate] generated migrations/${result.file}`);
            if (args.ops) {
                console.log(
                    '[astromech db:generate] hand-authored ops — verify with ' +
                        '`npm run db:init` on a fresh database and the chain↔table parity test'
                );
            }
        }
    },
});
