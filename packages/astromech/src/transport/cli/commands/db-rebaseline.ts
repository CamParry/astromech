/**
 * `astromech db:rebaseline`
 *
 * Re-emits the baseline migration and `snapshot.json` from the current core
 * tables, so a change in the DDL *renderer* (which the differ structurally
 * cannot see, since the snapshot records schema state rather than SQL text)
 * reaches the committed chain. Tables with no descriptor are copied verbatim.
 *
 * `--collapse` additionally folds every migration past the baseline into it.
 * Both modes rewrite history, which is legal only before a release.
 */

import { resolve } from 'node:path';
import { defineCommand } from 'citty';
import { rebaselineMigrations } from '@/database/generate';
import { CORE_TABLES } from '@/database/schema';
import { loadConfig } from '../config';

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
    },
    async run({ args }) {
        await loadConfig(args.config);

        let result;
        try {
            result = await rebaselineMigrations({
                dir: resolve(process.cwd(), 'migrations'),
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
            `[astromech db:rebaseline] rewrote migrations/${result.tag}.ts — ` +
                `${result.emitted.length} table(s) re-emitted, ` +
                `${result.preserved.length} copied verbatim (${result.preserved.join(', ') || 'none'})`
        );
        for (const file of result.deleted) {
            console.log(`[astromech db:rebaseline] deleted migrations/${file}`);
        }
        console.log(
            '[astromech db:rebaseline] rewrote migrations/snapshot.json, journal.json and index.ts'
        );
        console.log(
            '[astromech db:rebaseline] WARNING: any database that already applied the old ' +
                'chain must be re-initialised — kysely refuses to migrate a ledger naming ' +
                'migrations that no longer exist ("corrupted migrations"), and db:init is ' +
                'what throws, so it cannot recover on its own.'
        );
    },
});
