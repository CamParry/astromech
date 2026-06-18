/**
 * Core backup logic — dump, compress, store, and rotate old artifacts.
 *
 * Overlap guard: a module-level globalThis flag prevents a second performBackup
 * call from overlapping within the same process. Multi-instance (e.g. multiple
 * Workers) overlap is NOT guarded in v1 — single-instance self-hosted assumption.
 */

import { Readable } from 'node:stream';
import { createGzip } from 'node:zlib';
import { eq, isNull, desc, and } from 'drizzle-orm';
import type { PluginContext } from 'astromech';
import { PERMISSION_NAMESPACE } from './manifest.js';
import { backupRunsTable } from './schema/runs.js';
import type { BackupRunRow } from './schema/runs.js';

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
    if (isBackupRunning()) {
        ctx.logger.warn('[backups] A backup is already in progress — skipping.');
        const existing = await ctx.db
            .select()
            .from(backupRunsTable)
            .where(eq(backupRunsTable.status, 'running'))
            .orderBy(desc(backupRunsTable.startedAt))
            .limit(1);
        if (existing[0] !== undefined) return existing[0];
    }

    // Insert the running row.
    const [row] = await ctx.db
        .insert(backupRunsTable)
        .values({ status: 'running', trigger })
        .returning();

    if (row === undefined) {
        throw new Error('[backups] Failed to insert backup run row.');
    }

    const id = row.id;

    globalThis.__astromechBackupRunning = true;
    try {
        // Feature-check: does this driver support dump?
        if (!ctx.database.dump) {
            const [failed] = await ctx.db
                .update(backupRunsTable)
                .set({
                    status: 'failed',
                    error: 'dump not supported by this database driver',
                    finishedAt: new Date(),
                })
                .where(eq(backupRunsTable.id, id))
                .returning();
            return failed ?? row;
        }

        const dump = await ctx.database.dump();
        try {
            const timestamp = new Date()
                .toISOString()
                .replace(/[-:]/g, '')
                .replace(/\.\d+Z$/, 'Z');
            const shortId = id.slice(0, 8);
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

            const [success] = await ctx.db
                .update(backupRunsTable)
                .set({ status: 'success', key, sizeBytes, finishedAt: new Date() })
                .where(eq(backupRunsTable.id, id))
                .returning();

            const successRow = success ?? row;

            // Rotate old artifacts after a successful run.
            await rotate(ctx, opts.keep);

            return successRow;
        } finally {
            await dump.cleanup();
        }
    } catch (err) {
        ctx.logger.error('[backups] Backup failed', err);
        const [failed] = await ctx.db
            .update(backupRunsTable)
            .set({
                status: 'failed',
                error: String(err),
                finishedAt: new Date(),
            })
            .where(eq(backupRunsTable.id, id))
            .returning();
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
 * Key: `plugin:astromech-backups:retention`. Private setting — pass `{ full: true }`.
 * Falls back to `fallback` if the setting is absent or not a valid positive number.
 */
export async function resolveKeep(ctx: PluginContext, fallback: number): Promise<number> {
    const key = `plugin:${PERMISSION_NAMESPACE}:retention`;
    try {
        const value = await ctx.sdk.settings.get(key, { full: true });
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
 */
export async function rotate(ctx: PluginContext, keep: number): Promise<void> {
    const rows = await ctx.db
        .select()
        .from(backupRunsTable)
        .where(
            and(
                eq(backupRunsTable.status, 'success'),
                isNull(backupRunsTable.artifactDeletedAt)
            )
        )
        .orderBy(desc(backupRunsTable.startedAt));

    const toDelete = rows.slice(keep);
    for (const row of toDelete) {
        if (row.key !== null && row.key !== undefined) {
            await ctx.storage.delete(row.key);
        }
        await ctx.db
            .update(backupRunsTable)
            .set({ artifactDeletedAt: new Date() })
            .where(eq(backupRunsTable.id, row.id));
    }
}
