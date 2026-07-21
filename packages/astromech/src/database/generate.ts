/**
 * Migration generation — the descriptor-facing wrapper over
 * `@astromech/schema-engine/generate`.
 *
 * Converts the live `TableDescriptor`s to a snapshot, hands that to the engine,
 * and prints the warnings the engine returns (the engine itself never prints).
 *
 * Node-only (the engine's `./generate` subpath uses `node:fs/promises`) —
 * generation is a dev/CI-time step, never a runtime one. Do NOT re-export this
 * module from a barrel a browser bundle or a Worker runtime path might pull in
 * (`database/index.ts` / `exports/schema.ts` stay fs-free) — the CLI
 * (`transport/cli/commands/db-generate.ts`) is the only caller.
 */

import { generateMigrations as engineGenerate } from '@astromech/schema-engine/generate';
import { createSnapshot, type SqlDialect } from '@/database/descriptor-snapshot.js';
import type { TableDescriptor } from '@/database/define-table.js';
import type { GenerateResult } from '@astromech/schema-engine/generate';

export type { GenerateResult };

export async function generateMigrations(opts: {
    dir: string;
    tables: TableDescriptor[];
    dialect: SqlDialect;
    name: string;
}): Promise<GenerateResult> {
    const snapshot = createSnapshot(opts.tables, { dialect: opts.dialect });
    const result = await engineGenerate({ ...opts, snapshot });
    if (result.status === 'generated') {
        for (const warning of result.warnings) {
            console.warn(`[astromech db:generate] WARNING: ${warning}`);
        }
    }
    return result;
}
