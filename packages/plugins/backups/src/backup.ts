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
import { PERMISSION_NAMESPACE } from './manifest.js';
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
// Inline row helpers (no codec import from core — timestamps only)
// ============================================================================

/** CamelCase storage shape as seen through CamelCasePlugin. */
type RawRunRowCamel = {
    id: string;
    key: string | null;
    status: 'running' | 'success' | 'failed';
    trigger: 'scheduled' | 'manual' | 'pre-restore';
    sizeBytes: number | null;
    error: string | null;
    startedAt: number;
    finishedAt: number | null;
    artifactDeletedAt: number | null;
};

function decodeRow(raw: RawRunRowCamel): BackupRunRow {
    return {
        id: raw.id,
        key: raw.key,
        status: raw.status,
        trigger: raw.trigger,
        sizeBytes: raw.sizeBytes,
        error: raw.error,
        startedAt: new Date(raw.startedAt * 1000),
        finishedAt: raw.finishedAt !== null ? new Date(raw.finishedAt * 1000) : null,
        artifactDeletedAt:
            raw.artifactDeletedAt !== null
                ? new Date(raw.artifactDeletedAt * 1000)
                : null,
    };
}

/** Access the Kysely instance that ctx.db holds at runtime. */
function db(ctx: PluginContext): Kysely<Record<string, RawRunRowCamel>> {
    return ctx.db as unknown as Kysely<Record<string, RawRunRowCamel>>;
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
        if (first !== undefined) return decodeRow(first);
    }

    // Insert the running row.
    const id = crypto.randomUUID();
    const startedAt = Math.floor(Date.now() / 1000);
    const inserted = await db(ctx)
        .insertInto(TABLE)
        .values({
            id,
            status: 'running',
            trigger,
            startedAt,
        } as unknown as RawRunRowCamel)
        .returningAll()
        .executeTakeFirst();

    if (inserted === undefined) {
        throw new Error('[backups] Failed to insert backup run row.');
    }

    const row = decodeRow(inserted);

    globalThis.__astromechBackupRunning = true;
    try {
        // Feature-check: does this driver support dump?
        if (!ctx.database.dump) {
            const failed = await db(ctx)
                .updateTable(TABLE)
                .set({
                    status: 'failed',
                    error: 'dump not supported by this database driver',
                    finishedAt: Math.floor(Date.now() / 1000),
                } as unknown as RawRunRowCamel)
                .where('id', '=', id)
                .returningAll()
                .executeTakeFirst();
            return failed !== undefined ? decodeRow(failed) : row;
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

            const success = await db(ctx)
                .updateTable(TABLE)
                .set({
                    status: 'success',
                    key,
                    sizeBytes,
                    finishedAt: Math.floor(Date.now() / 1000),
                } as unknown as RawRunRowCamel)
                .where('id', '=', id)
                .returningAll()
                .executeTakeFirst();

            const successRow = success !== undefined ? decodeRow(success) : row;

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
            .set({
                status: 'failed',
                error: String(err),
                finishedAt: Math.floor(Date.now() / 1000),
            } as unknown as RawRunRowCamel)
            .where('id', '=', id)
            .returningAll()
            .executeTakeFirst();
        return failed !== undefined ? decodeRow(failed) : row;
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
    const rows = await db(ctx)
        .selectFrom(TABLE)
        .selectAll()
        .where('status', '=', 'success')
        .where('artifactDeletedAt', 'is', null)
        .orderBy('startedAt', 'desc')
        .execute();

    const decoded = rows.map(decodeRow);
    const toDelete = decoded.slice(keep);
    for (const row of toDelete) {
        if (row.key !== null && row.key !== undefined) {
            await ctx.storage.delete(row.key);
        }
        await db(ctx)
            .updateTable(TABLE)
            .set({
                artifactDeletedAt: Math.floor(Date.now() / 1000),
            } as unknown as RawRunRowCamel)
            .where('id', '=', row.id)
            .execute();
    }
}
