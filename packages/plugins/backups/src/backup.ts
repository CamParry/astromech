/**
 * Core backup logic — dump, compress, store, and rotate old artifacts.
 *
 * Overlap guard: a module-level globalThis flag prevents a second performBackup
 * call from overlapping within the same process. Multi-instance (e.g. multiple
 * Workers) overlap is NOT guarded in v1 — single-instance self-hosted assumption.
 */

import type { BackupRunRow } from './tables/runs';
import type { PluginContext } from 'astromech';
import { Readable } from 'node:stream';
import { createGzip } from 'node:zlib';
import { BACKUPS_SETTINGS_PATH } from './pages/settings';
import { createBackupRunsStorage } from './storage';

// ============================================================================
// In-process overlap guard
// ============================================================================

declare global {
    var __astromechBackupRunning: boolean | undefined;
}

export function isBackupRunning(): boolean {
    return globalThis.__astromechBackupRunning === true;
}

// ============================================================================
// Core
// ============================================================================

export async function performBackup(
    ctx: PluginContext,
    trigger: 'scheduled' | 'manual' | 'pre-restore',
    opts: { keep: number }
): Promise<BackupRunRow> {
    const runs = createBackupRunsStorage(ctx.db);

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

            // Rotate old artifacts after a successful run.
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

// ============================================================================
// resolveKeep — shared across cron handler (index.ts) and HTTP routes
// ============================================================================

/**
 * Read the retention setting for this plugin from the settings store.
 *
 * The settings page writes one object blob at its own key —
 * `plugin:<permissionNamespace>:<page path>`, the `baseKey` core derives — so
 * the value read here is `{ retention }`, not a bare number. Reads through
 * `ctx.settings` are full-shaped by default (plugin altitude is trusted server
 * code), so a private setting needs no options here.
 *
 * Falls back to `fallback` if the setting is absent or not a valid positive number.
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
 * first `keep`, ordered oldest-first. The table is the source of truth —
 * we only touch artifacts that haven't already been deleted (`artifactDeletedAt IS NULL`).
 *
 * `rotationCandidates` decides what is eligible: already-rotated rows and
 * `pre-restore` snapshots are not in the list, so neither is counted against
 * `keep`.
 */
export async function rotate(ctx: PluginContext, keep: number): Promise<void> {
    const runs = createBackupRunsStorage(ctx.db);
    const candidates = await runs.rotationCandidates();

    const toDelete = candidates.slice(keep);
    for (const row of toDelete) {
        if (row.key !== null && row.key !== undefined) {
            await ctx.storage.delete(row.key);
        }
        await runs.markArtifactDeleted(row.id);
    }
}
