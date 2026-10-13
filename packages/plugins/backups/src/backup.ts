/**
 * Core backup logic — dump, compress, store, and rotate old artifacts. A
 * module-level flag guards against overlapping runs within one process only;
 * multi-instance overlap is not guarded.
 */

import type { BackupRunRow } from './tables/runs';
import type { BackupRunTrigger } from './types';
import type { PluginContext } from 'astromech';
import { createGzip } from 'node:zlib';
import { BACKUPS_SETTINGS_KEY } from './globals/settings';
import { createBackupRunsRepository } from './repository';
import { pipelineTo } from './streams';

declare global {
    var __astromechBackupRunning: boolean | undefined;
}

/** Whether a backup is currently running in this process (overlap guard). */
export function isBackupRunning(): boolean {
    return globalThis.__astromechBackupRunning === true;
}

/**
 * Run one backup: dump the database, gzip it, store it, record run status,
 * and rotate old artifacts on success.
 */
export async function performBackup(
    ctx: PluginContext,
    trigger: BackupRunTrigger,
    opts: { keep: number }
): Promise<BackupRunRow> {
    const runs = createBackupRunsRepository(ctx.db);

    if (isBackupRunning()) {
        ctx.logger.warn('[backups] A backup is already in progress — skipping.');
        const existing = await runs.findRunning();
        if (existing !== null) return existing;
    }

    const row = await runs.create(trigger);
    const id = row.id;

    globalThis.__astromechBackupRunning = true;
    try {
        // Feature-check: does this driver support dump?
        if (!ctx.database.dump) {
            const failed = await runs.update(id, {
                status: 'failed',
                error: 'dump not supported by this database driver',
                finishedAt: new Date(),
            });
            return failed ?? row;
        }

        const dump = await ctx.database.dump();
        try {
            const timestamp = new Date()
                .toISOString()
                .replace(/[-:]/g, '')
                .replace(/\.\d+Z$/, 'Z');
            // Tail, not head: a ULID leads with its timestamp, which the key
            // already carries — the entropy is at the end.
            const shortId = id.slice(-8);
            const key = `${timestamp}-${shortId}.sqlite.gz`;

            await pipelineTo(dump.stream, createGzip(), (gzipped) =>
                ctx.storage.put(key, gzipped, { contentType: 'application/gzip' })
            );

            // The artifact is stored before the row that records it, so a failed
            // row write removes the artifact rather than leave it orphaned.
            let success: BackupRunRow | null;
            try {
                // Determine artifact size cheaply — get() returns size without reading body.
                const obj = await ctx.storage.get(key);
                const sizeBytes = obj?.size ?? null;

                success = await runs.update(id, {
                    status: 'success',
                    key,
                    sizeBytes,
                    finishedAt: new Date(),
                });
            } catch (error) {
                await removeArtifact(ctx, key);
                throw error;
            }

            const successRow = success ?? row;

            await rotate(ctx, opts.keep);

            return successRow;
        } finally {
            await dump.cleanup();
        }
    } catch (err) {
        ctx.logger.error('[backups] Backup failed', err);
        const failed = await runs.update(id, {
            status: 'failed',
            error: String(err),
            finishedAt: new Date(),
        });
        return failed ?? row;
    } finally {
        globalThis.__astromechBackupRunning = false;
    }
}

/**
 * Remove an artifact no run row records. Runs once the row write has failed, so
 * a failure is logged rather than thrown and leaves at worst an orphaned file.
 */
async function removeArtifact(ctx: PluginContext, key: string): Promise<void> {
    try {
        await ctx.storage.delete(key);
    } catch (error) {
        ctx.logger.warn(
            `[backups] Could not remove the artifact ${key}, which is now orphaned: ` +
                `${error instanceof Error ? error.message : String(error)}`
        );
    }
}

/**
 * Read the retention count from the plugin's `settings` global, shared across
 * the cron handler and HTTP routes. Falls back to `fallback` if the global is
 * unsaved or the value is not a valid positive number.
 */
export async function resolveKeep(ctx: PluginContext, fallback: number): Promise<number> {
    const key = `${ctx.plugin.namespace}/${BACKUPS_SETTINGS_KEY}`;
    try {
        // The plugin's own settings: the full shape, whatever their status.
        const global = await ctx.globals.get({ key, full: true });
        const value = global?.fields['retention'];
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
            return Math.floor(value);
        }
    } catch {
        // Globals not available in this context; fall through to fallback.
    }
    return fallback;
}

/**
 * Rotate artifacts: delete storage objects for successful runs beyond the
 * first `keep`, ordered oldest-first. `findRotationCandidates` decides what is
 * eligible — already-rotated rows and `pre-restore` snapshots are excluded.
 */
export async function rotate(ctx: PluginContext, keep: number): Promise<void> {
    const runs = createBackupRunsRepository(ctx.db);
    const candidates = await runs.findRotationCandidates();

    const toDelete = candidates.slice(keep);
    for (const row of toDelete) {
        if (row.key !== null && row.key !== undefined) {
            await ctx.storage.delete(row.key);
        }
        // The row stays for audit history: only a manual delete removes it.
        await runs.update(row.id, { artifactDeletedAt: new Date() });
    }
}
