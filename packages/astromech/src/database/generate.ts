/**
 * Migration generation — the `Table`-facing wrapper over
 * `@astromech/schema-engine/generate`.
 *
 * Converts the live `Table`s to a snapshot, hands that to the engine,
 * and prints the warnings the engine returns (the engine itself never prints).
 *
 * Node-only (the engine's `./generate` subpath uses `node:fs/promises`) —
 * generation is a dev/CI-time step, never a runtime one. Do NOT re-export this
 * module from a barrel a browser bundle or a Worker runtime path might pull in
 * (`database/index.ts` / `exports/database-schema.ts` stay fs-free) — the CLI
 * (`transport/cli/commands/db-generate.ts`) is the only caller.
 */

import type { Table } from '@/database/define-table';
import type { SqlDialect } from '@/database/table-snapshot';
import type {
    GenerateResult,
    MigrationOpsAuthor,
    RebaselineResult,
} from '@astromech/schema-engine/generate';
import {
    generateMigrations as engineGenerate,
    generateMigrationFromOps as engineGenerateFromOps,
    rebaselineMigrations as engineRebaseline,
} from '@astromech/schema-engine/generate';
import { createSnapshot } from '@/database/table-snapshot';

export type { GenerateResult, MigrationOpsAuthor, RebaselineResult };

function reportWarnings(result: GenerateResult): GenerateResult {
    if (result.status === 'generated') {
        for (const warning of result.warnings) {
            console.warn(`[astromech db:generate] WARNING: ${warning}`);
        }
    }
    return result;
}

export async function generateMigrations(opts: {
    dir: string;
    tables: Table[];
    dialect: SqlDialect;
    name: string;
}): Promise<GenerateResult> {
    const snapshot = createSnapshot(opts.tables, { dialect: opts.dialect });
    return reportWarnings(await engineGenerate({ ...opts, snapshot }));
}

/**
 * Write a migration whose ops the author supplied, for the transitions the
 * differ refuses (see the engine's `generateMigrationFromOps`). The snapshot
 * still comes from the live tables, so the destination is not negotiable —
 * only the route is.
 */
export async function generateMigrationsFromOps(opts: {
    dir: string;
    tables: Table[];
    dialect: SqlDialect;
    name: string;
    author: MigrationOpsAuthor;
}): Promise<GenerateResult> {
    const snapshot = createSnapshot(opts.tables, { dialect: opts.dialect });
    return reportWarnings(await engineGenerateFromOps({ ...opts, snapshot }));
}

/**
 * Re-emit the app's baseline migration from the live tables (see the engine's
 * `rebaselineMigrations`). `collapse` additionally folds every later migration
 * into it, which rewrites history and is legal only before a release.
 */
export async function rebaselineMigrations(opts: {
    dir: string;
    tables: Table[];
    dialect: SqlDialect;
    collapse?: boolean;
}): Promise<RebaselineResult> {
    const snapshot = createSnapshot(opts.tables, { dialect: opts.dialect });
    return engineRebaseline({ ...opts, snapshot });
}
