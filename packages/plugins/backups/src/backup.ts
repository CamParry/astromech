/**
 * Core backup logic — dump, compress, store, and rotate old artifacts. A
 * module-level flag guards against overlapping runs within one process only;
 * multi-instance overlap is not guarded.
 */

import type { BackupRunRow } from './tables/runs';
import type { PluginContext } from 'astromech';
import { Readable } from 'node:stream';
import { createGzip } from 'node:zlib';
import { BACKUPS_SETTINGS_PATH } from './pages/settings';
import { createBackupRunsRepository } from './repository';

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
    trigger: 'scheduled' | 'manual' | 'pre-restore',
    opts: { keep: number }
): Promise<BackupRunRow> {
    const runs = createBackupRunsRepository(ctx.db);

    if (isBackupRunning()) {
        ctx.logger.warn('[backups] A backup is already in progress — skipping.');
        const existing = await runs.latestRunning();
        if (existing !== null) return existing;
    }

    const row = await runs.start(trigger);
    const id = row.id;

    globalThis.__astromechBackupRunning = true;
    try {
        // Feature-check: does this driver support dump?
        if (!ctx.database.dump) {
            const failed = await runs.patch(id, {
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

            // Compress: web stream → Node Readable → gzip pipe → web ReadableStream.
            const nodeReadable = Readable.fromWeb(
                dump.stream as Parameters<typeof Readable.fromWeb>[0]
            );
            const gzipTransform = createGzip();
            nodeReadable.pipe(gzipTransform);
            const gzipped = Readable.toWeb(gzipTransform) as ReadableStream<Uint8Array>;

            await ctx.storage.put(key, gzipped, { contentType: 'application/gzip' });

            // Determine artifact size cheaply — get() returns size without reading body.
            const obj = await ctx.storage.get(key);
            const sizeBytes = obj?.size ?? null;

            const success = await runs.patch(id, {
                status: 'success',
                key,
                sizeBytes,
                finishedAt: new Date(),
            });

            const successRow = success ?? row;

            await rotate(ctx, opts.keep);

            return successRow;
        } finally {
            await dump.cleanup();
        }
    } catch (err) {
        ctx.logger.error('[backups] Backup failed', err);
        const failed = await runs.patch(id, {
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
 * Read the retention setting for this plugin from the settings store, shared
 * across the cron handler and HTTP routes. Falls back to `fallback` if the
 * setting is absent or not a valid positive number.
 */
export async function resolveKeep(ctx: PluginContext, fallback: number): Promise<number> {
    const key = `plugin:${ctx.plugin.permissionNamespace}:${BACKUPS_SETTINGS_PATH}`;
    try {
        const settings = await ctx.settings.get({ key });
        const value =
            typeof settings === 'object' && settings !== null && !Array.isArray(settings)
                ? settings['retention']
                : null;
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
            return Math.floor(value);
        }
    } catch {
        // Settings not available in this context; fall through to fallback.
    }
    return fallback;
}

/**
 * Rotate artifacts: delete storage objects for successful runs beyond the
 * first `keep`, ordered oldest-first. `rotationCandidates` decides what is
 * eligible — already-rotated rows and `pre-restore` snapshots are excluded.
 */
export async function rotate(ctx: PluginContext, keep: number): Promise<void> {
    const runs = createBackupRunsRepository(ctx.db);
    const candidates = await runs.rotationCandidates();

    const toDelete = candidates.slice(keep);
    for (const row of toDelete) {
        if (row.key !== null && row.key !== undefined) {
            await ctx.storage.delete(row.key);
        }
        await runs.markArtifactDeleted(row.id);
    }
}
