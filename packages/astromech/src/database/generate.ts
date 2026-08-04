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

import {
    generateMigrations as engineGenerate,
    generateMigrationFromOps as engineGenerateFromOps,
} from '@astromech/schema-engine/generate';
import { createSnapshot, type SqlDialect } from '@/database/table-snapshot.js';
import type { Table } from '@/database/define-table.js';
import type {
    GenerateResult,
    MigrationOpsAuthor,
} from '@astromech/schema-engine/generate';

export type { GenerateResult, MigrationOpsAuthor };

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
