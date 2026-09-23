/**
 * `astromech db:rebaseline`
 *
 * Re-emits the baseline migration and snapshot from the current core tables.
 * `--collapse` folds later migrations into it too — legal only before release.
 */

import { join } from 'node:path';
import { defineCommand } from 'citty';
import { resolveMigrationsDir } from '@/database/app-migrations';
import { rebaselineMigrations } from '@/database/generate';
import { CORE_TABLES } from '@/database/tables';
import { loadConfig } from '../config';
import { allowRemoteArgs, toAllowRemoteOption } from '../remote-args';

export default defineCommand({
    meta: {
        name: 'db:rebaseline',
        description: "Regenerate this app's baseline migration and snapshot",
    },
    args: {
        config: { type: 'string', description: 'Path to astromech.config.ts' },
        collapse: {
            type: 'boolean',
            description: 'Fold every migration past the baseline into it',
        },
        ...allowRemoteArgs,
    },
    async run({ args }) {
        const { resolved: config } = await loadConfig(
            args.config,
            toAllowRemoteOption(args)
        );
        const folder = config.migrationsDir;

        let result;
        try {
            result = await rebaselineMigrations({
                dir: resolveMigrationsDir(folder),
                tables: CORE_TABLES,
                dialect: 'sqlite',
                collapse: args.collapse === true,
            });
        } catch (err) {
            console.error(
                `[astromech db:rebaseline] ${err instanceof Error ? err.message : String(err)}`
            );
            process.exit(1);
        }

        console.log(
            `[astromech db:rebaseline] rewrote ${join(folder, `${result.tag}.ts`)} — ` +
                `${result.emitted.length} table(s) re-emitted, ` +
                `${result.preserved.length} copied verbatim (${result.preserved.join(', ') || 'none'})`
        );
        for (const file of result.deleted) {
            console.log(`[astromech db:rebaseline] deleted ${join(folder, file)}`);
        }
        console.log(
            `[astromech db:rebaseline] rewrote ${join(folder, 'snapshot.json')}, journal.json and index.ts`
        );
        console.log(
            '[astromech db:rebaseline] WARNING: any database that already applied the old ' +
                'chain must be re-initialised — kysely refuses to migrate a ledger naming ' +
                'migrations that no longer exist ("corrupted migrations"), and db:init is ' +
                'what throws, so it cannot recover on its own.'
        );
    },
});
