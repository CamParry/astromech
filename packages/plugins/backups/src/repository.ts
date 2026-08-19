/**
 * Backup-run storage — the one place this plugin's table meets the database.
 *
 * `createRepository` owns encoding, `where`-value serialization and row decoding,
 * so nothing above this file spells the table name or reaches for a codec.
 * `backup.ts`, `routes/backups.ts` and `service/backups.ts` each used to carry
 * their own copy of the same `ctx.db` cast plus a `TABLE` const — three
 * restatements of one access pattern, which is what this module replaces.
 *
 * The handle is an argument, not a lookup: a plugin is *handed* its database on
 * `ctx.db` and must never reach for core's registry.
 */
import type { BackupRunRow } from './tables/runs';
import type { Patch, PluginContext } from 'astromech';
import { createRepository } from 'astromech';
import { backupRunsTable } from './tables/runs';

/** A partial write against a run row — the status transitions below. */
export type BackupRunPatch = Patch<typeof backupRunsTable>;

export type BackupRunsRepository = ReturnType<typeof createBackupRunsRepository>;

export function createBackupRunsRepository(db: PluginContext['db']) {
    const repository = createRepository(backupRunsTable, db);

    /** By id; `null` when there is no such run. */
    async function get(id: string): Promise<BackupRunRow | null> {
        return repository.findOne({ id });
    }

    /** Newest first, capped at `limit` — the admin list. */
    async function recent(limit: number): Promise<BackupRunRow[]> {
        return repository.findMany({ orderBy: [['startedAt', 'desc']], limit });
    }

    /**
     * The newest run still marked `running` — what the overlap guard returns
     * instead of starting a second backup.
     */
    async function latestRunning(): Promise<BackupRunRow | null> {
        const [newest] = await repository.findMany({
            where: { status: 'running' },
            orderBy: [['startedAt', 'desc']],
            limit: 1,
        });
        return newest ?? null;
    }

    /**
     * Open a run. The table fills `id` (a ULID) and `startedAt`, so the id
     * is read back off the returned row rather than minted here.
     */
    async function start(trigger: BackupRunRow['trigger']): Promise<BackupRunRow> {
        return repository.create({ status: 'running', trigger });
    }

    /**
     * Apply a status transition, returning the updated row — or `null` when the
     * row has vanished underneath us.
     *
     * Deliberately not `storage.update`, which throws on a missing row: every
     * caller is finishing a run it opened itself and falls back to the row it
     * already holds, so a lost bookkeeping row must not turn into a thrown
     * backup. The follow-up read only runs when the update matched.
     */
    async function patch(
        id: string,
        values: BackupRunPatch
    ): Promise<BackupRunRow | null> {
        const updated = await repository.updateMany({ id }, values);
        return updated > 0 ? get(id) : null;
    }

    /**
     * Successful runs whose artifact is still present, newest first — the input
     * to rotation, which keeps the head of this list and drops the tail. The
     * table is the source of truth, so an already-rotated row is excluded here
     * rather than re-deleted.
     *
     * `pre-restore` snapshots are excluded: they are the undo for a restore, so
     * they must neither be rotated away nor count against keep-N and push a
     * scheduled backup out of the window.
     *
     * `startedAt` is ISO-8601 TEXT with millisecond precision, but two runs can
     * still share a millisecond, so `id` breaks the tie — a ULID leads with its
     * timestamp, so id-desc agrees with startedAt-desc.
     */
    async function rotationCandidates(): Promise<BackupRunRow[]> {
        return repository.findMany({
            where: {
                status: 'success',
                artifactDeletedAt: null,
                trigger: { ne: 'pre-restore' },
            },
            orderBy: [
                ['startedAt', 'desc'],
                ['id', 'desc'],
            ],
        });
    }

    /**
     * Record that rotation dropped the artifact. The row stays for audit
     * history — only a manual delete removes it.
     */
    async function markArtifactDeleted(id: string): Promise<void> {
        await repository.updateMany({ id }, { artifactDeletedAt: new Date() });
    }

    /** Hard delete — a manual delete drops the row along with its artifact. */
    async function remove(id: string): Promise<void> {
        await repository.delete(id);
    }

    return {
        get,
        recent,
        latestRunning,
        start,
        patch,
        rotationCandidates,
        markArtifactDeleted,
        delete: remove,
    };
}
