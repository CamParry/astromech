/**
 * Service methods for @astromech/backups — the JSON half of the plugin's API.
 *
 * Only the two streaming endpoints (artifact download, artifact restore) stay
 * on `rawRoutes`; everything that is plain JSON belongs here, where it is
 * typed, callable off `Astromech.plugins.backups` and off `service` in the
 * admin page, and visible to the method manifest the CLI and MCP discover from.
 *
 * Row access goes through `createBackupRunsStorage`, which owns the table name,
 * the codec and the ordering.
 */

import type { BackupRunRow } from '../tables/runs';
import { defineServiceMethod, noInput, z } from 'astromech';
import { isBackupRunning, performBackup, resolveKeep } from '../backup';
import { createBackupRunsStorage } from '../storage';

const MAX_RUNS = 100;

// ============================================================================
// Result shapes
// ============================================================================

/** Driver capabilities, feature-detected per request so the UI can grey out actions. */
export type BackupCapabilities = {
    canDump: boolean;
    canRestore: boolean;
};

export type ListRunsResult = {
    runs: BackupRunRow[];
    capabilities: BackupCapabilities;
};

/**
 * RPC returns the handler's result rather than an HTTP status, so the failure
 * cases that were 409/404 as raw routes are values the caller branches on.
 */
export type TriggerRunResult =
    | { ok: true; run: BackupRunRow }
    | { ok: false; reason: 'already-running' };

export type DeleteRunResult =
    | { ok: true; id: string }
    | { ok: false; reason: 'not-found' };

// ============================================================================
// Service
// ============================================================================

export function buildBackupsService(defaultKeep: number) {
    return {
        listRuns: defineServiceMethod<undefined, ListRunsResult>({
            access: { permission: 'read' },
            summary: 'List recent backup runs and the driver capabilities.',
            input: noInput(),
            mutates: false,
            handler: async (_input, ctx): Promise<ListRunsResult> => {
                return {
                    runs: await createBackupRunsStorage(ctx.db).recent(MAX_RUNS),
                    capabilities: {
                        canDump: ctx.database.dump !== undefined,
                        canRestore: ctx.database.restore !== undefined,
                    },
                };
            },
        }),

        triggerRun: defineServiceMethod<undefined, TriggerRunResult>({
            access: { permission: 'run' },
            summary: 'Take a backup now.',
            input: noInput(),
            mutates: true,
            handler: async (_input, ctx): Promise<TriggerRunResult> => {
                if (isBackupRunning()) return { ok: false, reason: 'already-running' };
                const keep = await resolveKeep(ctx, defaultKeep);
                return { ok: true, run: await performBackup(ctx, 'manual', { keep }) };
            },
        }),

        deleteRun: defineServiceMethod<{ id: string }, DeleteRunResult>({
            access: { permission: 'delete' },
            summary: 'Delete a backup run and its stored artifact.',
            input: z.object({ id: z.string() }),
            mutates: true,
            destructive: true,
            handler: async (input, ctx): Promise<DeleteRunResult> => {
                const id = typeof input?.id === 'string' ? input.id : '';
                const runs = createBackupRunsStorage(ctx.db);
                const row = await runs.get(id);
                if (row === null) return { ok: false, reason: 'not-found' };

                // A manual delete hard-deletes the row. This differs from
                // rotation, which marks `artifactDeletedAt` and keeps the row
                // for audit history — so only drop a live artifact here.
                if (
                    row.key !== null &&
                    row.key !== undefined &&
                    (row.artifactDeletedAt === null ||
                        row.artifactDeletedAt === undefined)
                ) {
                    await ctx.storage.delete(row.key);
                }

                await runs.delete(id);
                return { ok: true, id };
            },
        }),
    };
}
