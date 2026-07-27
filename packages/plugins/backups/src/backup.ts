/**
 * Core backup logic — dump, compress, store, and rotate old artifacts.
 *
 * Overlap guard: a module-level globalThis flag prevents a second performBackup
 * call from overlapping within the same process. Multi-instance (e.g. multiple
 * Workers) overlap is NOT guarded in v1 — single-instance self-hosted assumption.
 */

import { Readable } from 'node:stream';
import { createGzip } from 'node:zlib';
import type { Kysely } from 'kysely';
import type { PluginContext } from 'astromech';
import { decodeWith, encodeWith, encodePatchWith } from 'astromech/plugin-kit';
import { NAMESPACE } from './plugin.js';
import { backupRunsTable, type BackupRunRow } from './schema/runs.js';

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
// Row access
// ============================================================================

/**
 * Access the Kysely instance that ctx.db holds at runtime, typed against the
 * descriptor's domain row. These are raw queries — the shared handle applies no
 * codec — so every read is passed through `decodeWith` and every write is built
 * with `encodeWith`/`encodePatchWith` before it reaches the query builder.
 */
function db(ctx: PluginContext): Kysely<Record<string, BackupRunRow>> {
    return ctx.db as unknown as Kysely<Record<string, BackupRunRow>>;
}

const TABLE = 'plugin_backups_runs' as const;

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
        const existing = await db(ctx)
            .selectFrom(TABLE)
            .selectAll()
            .where('status', '=', 'running')
            .orderBy('startedAt', 'desc')
            .limit(1)
            .execute();
        const first = existing[0];
        if (first !== undefined) return decodeWith(backupRunsTable, first);
    }

    // Insert the running row — `encodeWith` fills the descriptor's app defaults
    // (`id` as a ULID, `startedAt` as now), so the id comes back off the row.
    const inserted = await db(ctx)
        .insertInto(TABLE)
        .values(
            encodeWith(backupRunsTable, {
                status: 'running',
                trigger,
            }) as unknown as BackupRunRow
        )
        .returningAll()
        .executeTakeFirst();

    if (inserted === undefined) {
        throw new Error('[backups] Failed to insert backup run row.');
    }

    const row = decodeWith(backupRunsTable, inserted);
    const id = row.id;

    globalThis.__astromechBackupRunning = true;
    try {
        // Feature-check: does this driver support dump?
        if (!ctx.database.dump) {
            const failed = await db(ctx)
                .updateTable(TABLE)
                .set(
                    encodePatchWith(backupRunsTable, {
                        status: 'failed',
                        error: 'dump not supported by this database driver',
                        finishedAt: new Date(),
                    }) as unknown as BackupRunRow
                )
                .where('id', '=', id)
                .returningAll()
                .executeTakeFirst();
            return failed !== undefined ? decodeWith(backupRunsTable, failed) : row;
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

            const success = await db(ctx)
                .updateTable(TABLE)
                .set(
                    encodePatchWith(backupRunsTable, {
                        status: 'success',
                        key,
                        sizeBytes,
                        finishedAt: new Date(),
                    }) as unknown as BackupRunRow
                )
                .where('id', '=', id)
                .returningAll()
                .executeTakeFirst();

            const successRow =
                success !== undefined ? decodeWith(backupRunsTable, success) : row;

            // Rotate old artifacts after a successful run.
            await rotate(ctx, opts.keep);

            return successRow;
        } finally {
            await dump.cleanup();
        }
    } catch (err) {
        ctx.logger.error('[backups] Backup failed', err);
        const failed = await db(ctx)
            .updateTable(TABLE)
            .set(
                encodePatchWith(backupRunsTable, {
                    status: 'failed',
                    error: String(err),
                    finishedAt: new Date(),
                }) as unknown as BackupRunRow
            )
            .where('id', '=', id)
            .returningAll()
            .executeTakeFirst();
        return failed !== undefined ? decodeWith(backupRunsTable, failed) : row;
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
    const key = `plugin:${NAMESPACE}:retention`;
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
    const rows = await db(ctx)
        .selectFrom(TABLE)
        .selectAll()
        .where('status', '=', 'success')
        .where('artifactDeletedAt', 'is', null)
        .orderBy('startedAt', 'desc')
        .execute();

    const decoded = rows.map((raw) => decodeWith(backupRunsTable, raw));
    const toDelete = decoded.slice(keep);
    for (const row of toDelete) {
        if (row.key !== null && row.key !== undefined) {
            await ctx.storage.delete(row.key);
        }
        await db(ctx)
            .updateTable(TABLE)
            .set(
                encodePatchWith(backupRunsTable, {
                    artifactDeletedAt: new Date(),
                }) as unknown as BackupRunRow
            )
            .where('id', '=', row.id)
            .execute();
    }
}
