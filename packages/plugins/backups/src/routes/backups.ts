/**
 * Raw HTTP routes for the backups plugin.
 * Mounted at `/api/plugins/backups/*` by the plugin runtime.
 *
 * Access values use bare permission keys — the mount layer calls
 * resolvePluginPermission(namespace, key) which auto-namespaces them to
 * `plugin:astromech-backups:<key>` since they contain no colon.
 */

import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import { eq, desc } from 'drizzle-orm';
import type { PluginContext, PluginRawRoute } from 'astromech';
import { backupRunsTable } from '../schema/runs.js';
import type { BackupRunRow } from '../schema/runs.js';
import { isBackupRunning, performBackup, resolveKeep } from '../backup.js';

const MAX_RUNS = 100;

// ============================================================================
// Shared helpers
// ============================================================================

/** Returns true when the backup artifact exists and has not been rotated away. */
function isArtifactAvailable(row: BackupRunRow): boolean {
    return (
        row.key !== null &&
        row.key !== undefined &&
        (row.artifactDeletedAt === null || row.artifactDeletedAt === undefined)
    );
}

async function findRun(ctx: PluginContext, id: string): Promise<BackupRunRow | null> {
    const rows = await ctx.db
        .select()
        .from(backupRunsTable)
        .where(eq(backupRunsTable.id, id))
        .limit(1);
    return rows[0] ?? null;
}

/** Parse the last path segment from a URL pathname, e.g. `/backups/runs/abc-123/download` → `abc-123`. */
function parseSegment(pathname: string, offset: number): string {
    // segments = ['', 'backups', 'runs', ':id', 'download'] — offset is from the end
    const parts = pathname.split('/').filter(Boolean);
    return parts[parts.length - 1 - offset] ?? '';
}

// ============================================================================
// Handlers
// ============================================================================

async function listRuns(_request: Request, ctx: PluginContext): Promise<Response> {
    const rows = await ctx.db
        .select()
        .from(backupRunsTable)
        .orderBy(desc(backupRunsTable.startedAt))
        .limit(MAX_RUNS);
    const capabilities = {
        canDump: ctx.database.dump !== undefined,
        canRestore: ctx.database.restore !== undefined,
    };
    return Response.json({ data: rows, capabilities });
}

async function triggerRun(
    _request: Request,
    ctx: PluginContext,
    keep: number
): Promise<Response> {
    if (isBackupRunning()) {
        return Response.json({ error: 'A backup is already running' }, { status: 409 });
    }
    const resolvedKeep = await resolveKeep(ctx, keep);
    const row = await performBackup(ctx, 'manual', { keep: resolvedKeep });
    return Response.json({ data: row }, { status: 202 });
}

async function downloadArtifact(request: Request, ctx: PluginContext): Promise<Response> {
    const url = new URL(request.url);
    // pathname: /api/plugins/backups/runs/:id/download → id is second from end
    const id = parseSegment(url.pathname, 1);

    const row = await findRun(ctx, id);
    if (row === null) {
        return Response.json({ error: 'Backup run not found' }, { status: 404 });
    }
    if (!isArtifactAvailable(row)) {
        return Response.json({ error: 'Artifact no longer available' }, { status: 410 });
    }

    const obj = await ctx.storage.get(row.key);
    if (obj === null) {
        return Response.json({ error: 'Artifact no longer available' }, { status: 410 });
    }

    return new Response(obj.body, {
        headers: {
            'Content-Type': 'application/gzip',
            'Content-Disposition': `attachment; filename="${row.key}"`,
        },
    });
}

async function restoreFromBackup(
    request: Request,
    ctx: PluginContext,
    keep: number
): Promise<Response> {
    if (!ctx.database.restore) {
        return Response.json(
            { error: 'Restore is not supported by this database driver' },
            { status: 400 }
        );
    }

    const url = new URL(request.url);
    // pathname: /api/plugins/backups/runs/:id/restore → id is second from end
    const id = parseSegment(url.pathname, 1);

    const row = await findRun(ctx, id);
    if (row === null) {
        return Response.json({ error: 'Backup run not found' }, { status: 404 });
    }
    if (!isArtifactAvailable(row)) {
        return Response.json({ error: 'Artifact no longer available' }, { status: 410 });
    }

    if (isBackupRunning()) {
        return Response.json({ error: 'A backup is already running' }, { status: 409 });
    }

    try {
        // Safety snapshot before restore — makes this operation reversible.
        const resolvedKeep = await resolveKeep(ctx, keep);
        await performBackup(ctx, 'pre-restore', { keep: resolvedKeep });

        const obj = await ctx.storage.get(row.key);
        if (obj === null) {
            return Response.json(
                { error: 'Artifact no longer available' },
                { status: 410 }
            );
        }

        // Gunzip the stored stream before handing it to the restore driver.
        const gunzip = createGunzip();
        const nodeReadable = Readable.fromWeb(
            obj.body as Parameters<typeof Readable.fromWeb>[0]
        );
        nodeReadable.pipe(gunzip);
        const plain = Readable.toWeb(gunzip) as ReadableStream<Uint8Array>;

        await ctx.database.restore(plain, {
            preserve: ['plugin_backups_runs', '_astromech_cron'],
        });

        return Response.json({ data: { restored: row.id } });
    } catch (err) {
        ctx.logger.error('[backups] Restore failed', err);
        return Response.json({ error: String(err) }, { status: 500 });
    }
}

async function deleteRun(request: Request, ctx: PluginContext): Promise<Response> {
    const url = new URL(request.url);
    // pathname: /api/plugins/backups/runs/:id → id is last segment
    const id = parseSegment(url.pathname, 0);

    const row = await findRun(ctx, id);
    if (row === null) {
        return Response.json({ error: 'Backup run not found' }, { status: 404 });
    }

    // Delete the storage artifact if present and not already rotated away.
    // Manual delete = hard-delete the row entirely; this differs from rotation
    // (rotate() marks artifactDeletedAt and keeps the row for audit history).
    if (
        row.key !== null &&
        row.key !== undefined &&
        (row.artifactDeletedAt === null || row.artifactDeletedAt === undefined)
    ) {
        await ctx.storage.delete(row.key);
    }

    await ctx.db.delete(backupRunsTable).where(eq(backupRunsTable.id, id));

    return Response.json({ data: { deleted: id } });
}

// ============================================================================
// Route array factory
// ============================================================================

export function buildBackupRoutes(defaultKeep: number): PluginRawRoute[] {
    return [
        {
            method: 'GET',
            path: '/runs',
            access: { permission: 'read' },
            handler: (req, ctx) => listRuns(req, ctx),
        },
        {
            method: 'POST',
            path: '/run',
            access: { permission: 'run' },
            handler: (req, ctx) => triggerRun(req, ctx, defaultKeep),
        },
        {
            method: 'GET',
            path: '/runs/:id/download',
            access: { permission: 'read' },
            handler: (req, ctx) => downloadArtifact(req, ctx),
        },
        {
            method: 'POST',
            path: '/runs/:id/restore',
            access: { permission: 'restore' },
            handler: (req, ctx) => restoreFromBackup(req, ctx, defaultKeep),
        },
        {
            method: 'DELETE',
            path: '/runs/:id',
            access: { permission: 'delete' },
            handler: (req, ctx) => deleteRun(req, ctx),
        },
    ];
}
