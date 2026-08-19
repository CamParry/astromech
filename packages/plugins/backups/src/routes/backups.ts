/**
 * Raw HTTP routes for the backups plugin.
 * Mounted at `/api/plugins/backups/*` by the plugin runtime.
 *
 * Only the two STREAMING endpoints live here — a gzipped artifact going out,
 * and a gunzipped one going back into the database. Everything else the plugin
 * exposes is plain JSON and belongs on `defineServiceMethod` (see
 * `../service/backups.ts`), where it is typed and discoverable through the
 * method manifest; a raw route is invisible to the CLI and MCP.
 *
 * Access values use bare permission keys — the mount layer calls
 * resolvePluginPermission(namespace, key) which auto-namespaces them to
 * `plugin:backups:<key>` since they contain no colon.
 */
import type { BackupRunRow } from '../tables/runs';
import type { PluginContext, PluginRawRoute } from 'astromech';
import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import { isBackupRunning, performBackup, resolveKeep } from '../backup';
import { createBackupRunsRepository } from '../repository';
import { backupRunsTable } from '../tables/runs';

/**
 * The table's **SQL** name, for the restore driver's `preserve` list — that is a
 * list of real table names, not Kysely `DB` keys, so it stays the table's
 * `name` rather than anything the storage wrapper hands out. Row access goes
 * through `createBackupRunsRepository`; this is the one thing it cannot answer.
 */
const RUNS_TABLE = backupRunsTable.name;

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

/** Parse the last path segment from a URL pathname, e.g. `/backups/runs/abc-123/download` → `abc-123`. */
function parseSegment(pathname: string, offset: number): string {
    // segments = ['', 'backups', 'runs', ':id', 'download'] — offset is from the end
    const parts = pathname.split('/').filter(Boolean);
    return parts[parts.length - 1 - offset] ?? '';
}

// ============================================================================
// Handlers
// ============================================================================

async function downloadArtifact(request: Request, ctx: PluginContext): Promise<Response> {
    const url = new URL(request.url);
    // pathname: /api/plugins/backups/runs/:id/download → id is second from end
    const id = parseSegment(url.pathname, 1);

    const row = await createBackupRunsRepository(ctx.db).get(id);
    if (row === null) {
        return Response.json({ error: 'Backup run not found' }, { status: 404 });
    }
    if (!isArtifactAvailable(row)) {
        return Response.json({ error: 'Artifact no longer available' }, { status: 410 });
    }

    const obj = await ctx.storage.get(row.key as string);
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

    const row = await createBackupRunsRepository(ctx.db).get(id);
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

        const obj = await ctx.storage.get(row.key as string);
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
            preserve: [RUNS_TABLE, '_astromech_cron'],
        });

        return Response.json({ data: { restored: row.id } });
    } catch (err) {
        ctx.logger.error('[backups] Restore failed', err);
        return Response.json({ error: String(err) }, { status: 500 });
    }
}

// ============================================================================
// Route array factory
// ============================================================================

export function buildBackupRoutes(defaultKeep: number): PluginRawRoute[] {
    return [
        {
            method: 'GET',
            path: '/runs/:id/download',
            // NOT `read` — the artifact is a full database dump, so this is a
            // strictly higher grant than listing run metadata.
            access: { permission: 'download' },
            handler: (req, ctx) => downloadArtifact(req, ctx),
        },
        {
            method: 'POST',
            path: '/runs/:id/restore',
            access: { permission: 'restore' },
            handler: (req, ctx) => restoreFromBackup(req, ctx, defaultKeep),
        },
    ];
}
