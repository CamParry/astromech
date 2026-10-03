/**
 * The backups service: the JSON methods behind the Backups page. Download and
 * restore stream, so they stay on `rawRoutes`.
 */

import { defineServiceMethod, noInput, withFallback, z } from 'astromech';
import { isBackupRunning, performBackup, resolveKeep } from '../backup';
import { createBackupRunsRepository } from '../repository';
import { BACKUP_RUN_STATUSES, BACKUP_RUN_TRIGGERS } from '../types';

const MAX_RUNS = 100;

/** One backup run, as the service answers it. */
const backupRunSchema = z.object({
    id: z.string(),
    /** The artifact's storage key; null until the dump is stored. */
    key: withFallback(z.string().nullable(), null),
    status: z.enum(BACKUP_RUN_STATUSES),
    trigger: z.enum(BACKUP_RUN_TRIGGERS),
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

/** A run already in progress is a result the caller branches on, not an error. */
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
            summary: 'List recent backup runs and the driver capabilities.',
            input: noInput(),
            output: listRunsResultSchema,
            access: { permission: 'read' },
            mutates: false,
            async handler(_params, ctx): Promise<ListRunsResult> {
                const backupRuns = createBackupRunsRepository(ctx.db);

                const runs = await backupRuns.findRecent(MAX_RUNS);

                return {
                    runs,
                    capabilities: {
                        canDump: ctx.database.dump !== undefined,
                        canRestore: ctx.database.restore !== undefined,
                    },
                };
            },
        }),

        run: defineServiceMethod({
            summary: 'Take a backup now.',
            input: noInput(),
            output: triggerRunResultSchema,
            access: { permission: 'run' },
            mutates: true,
            async handler(_params, ctx): Promise<TriggerRunResult> {
                if (isBackupRunning()) return { ok: false, reason: 'already-running' };
                const keep = await resolveKeep(ctx, defaultKeep);

                const run = await performBackup(ctx, 'manual', { keep });

                return { ok: true, run };
            },
        }),

        delete: defineServiceMethod({
            summary: 'Delete a backup run and its stored artifact.',
            input: z.strictObject({ id: z.string() }),
            output: deleteRunResultSchema,
            access: { permission: 'delete' },
            mutates: true,
            destructive: true,
            idempotent: true,
            async handler(params, ctx): Promise<DeleteRunResult> {
                const { id } = params;
                const backupRuns = createBackupRunsRepository(ctx.db);

                const row = await backupRuns.findOne(id);
                if (row === null) return { ok: false, reason: 'not-found' };

                // Rotation deletes the artifact but keeps the row, marked with
                // `artifactDeletedAt`, so a marked row has no artifact to delete.
                const rotated =
                    row.artifactDeletedAt !== null && row.artifactDeletedAt !== undefined;
                if (!rotated && row.key !== null && row.key !== undefined) {
                    await ctx.storage.delete(row.key);
                }
                await backupRuns.delete(id);

                return { ok: true, id };
            },
        }),
    };
}
