/**
 * Service methods for @astromech/backups — the JSON half of the plugin's API.
 * Only the two streaming endpoints (download, restore) stay on `rawRoutes`;
 * everything else that is plain JSON belongs here, typed and discoverable.
 */

import { defineServiceMethod, noInput, withFallback, z } from 'astromech';
import { isBackupRunning, performBackup, resolveKeep } from '../backup';
import { createBackupRunsRepository } from '../repository';

const MAX_RUNS = 100;

/** One backup run, as the service answers it. */
const backupRunSchema = z.object({
    id: z.string(),
    /** The artifact's storage key; null until the dump is stored. */
    key: withFallback(z.string().nullable(), null),
    status: z.enum(['running', 'success', 'failed']),
    trigger: z.enum(['scheduled', 'manual', 'pre-restore']),
    sizeBytes: withFallback(z.number().nullable(), null),
    error: withFallback(z.string().nullable(), null),
    startedAt: z.date(),
    finishedAt: withFallback(z.date().nullable(), null),
    /** When rotation removed the artifact; the row stays for its history. */
    artifactDeletedAt: withFallback(z.date().nullable(), null),
});

export type BackupRun = z.output<typeof backupRunSchema>;

/** Driver capabilities, feature-detected per request so the UI can grey out actions. */
const backupCapabilitiesSchema = z.object({
    canDump: z.boolean(),
    canRestore: z.boolean(),
});

export type BackupCapabilities = z.output<typeof backupCapabilitiesSchema>;

const listRunsResultSchema = z.object({
    runs: z.array(backupRunSchema),
    capabilities: backupCapabilitiesSchema,
});

export type ListRunsResult = z.output<typeof listRunsResultSchema>;

/**
 * RPC returns the handler's result rather than an HTTP status, so the failure
 * cases that were 409/404 as raw routes are values the caller branches on.
 */
const triggerRunResultSchema = z.union([
    z.object({ ok: z.literal(true), run: backupRunSchema }),
    z.object({ ok: z.literal(false), reason: z.literal('already-running') }),
]);

export type TriggerRunResult = z.output<typeof triggerRunResultSchema>;

const deleteRunResultSchema = z.union([
    z.object({ ok: z.literal(true), id: z.string() }),
    z.object({ ok: z.literal(false), reason: z.literal('not-found') }),
]);

export type DeleteRunResult = z.output<typeof deleteRunResultSchema>;

/** The `list` / `run` / `delete` service methods, using `defaultKeep` as the fallback retention. */
export function createBackupsService(defaultKeep: number) {
    return {
        list: defineServiceMethod({
            access: { permission: 'read' },
            summary: 'List recent backup runs and the driver capabilities.',
            input: noInput(),
            output: listRunsResultSchema,
            mutates: false,
            handler: async (_input, ctx): Promise<ListRunsResult> => {
                return {
                    runs: await createBackupRunsRepository(ctx.db).findRecent(MAX_RUNS),
                    capabilities: {
                        canDump: ctx.database.dump !== undefined,
                        canRestore: ctx.database.restore !== undefined,
                    },
                };
            },
        }),

        run: defineServiceMethod({
            access: { permission: 'run' },
            summary: 'Take a backup now.',
            input: noInput(),
            output: triggerRunResultSchema,
            mutates: true,
            handler: async (_input, ctx): Promise<TriggerRunResult> => {
                if (isBackupRunning()) return { ok: false, reason: 'already-running' };
                const keep = await resolveKeep(ctx, defaultKeep);
                return { ok: true, run: await performBackup(ctx, 'manual', { keep }) };
            },
        }),

        delete: defineServiceMethod({
            access: { permission: 'delete' },
            summary: 'Delete a backup run and its stored artifact.',
            input: z.object({ id: z.string() }),
            output: deleteRunResultSchema,
            mutates: true,
            destructive: true,
            handler: async (input, ctx): Promise<DeleteRunResult> => {
                const id = typeof input?.id === 'string' ? input.id : '';
                const runs = createBackupRunsRepository(ctx.db);
                const row = await runs.findOne(id);
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
