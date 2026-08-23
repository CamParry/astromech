/**
 * Backup-run repository — the one place this plugin's table meets the database.
 * `createRepository` owns encoding, `where`-value serialization and row
 * decoding, so nothing above this file spells the table name or a codec.
 */
import type { BackupRunRow } from './tables/runs';
import type { Patch, PluginContext } from 'astromech';
import { createRepository } from 'astromech';
import { backupRunsTable } from './tables/runs';

/** A partial write against a run row — the status transitions below. */
export type BackupRunPatch = Patch<typeof backupRunsTable>;

export type BackupRunsRepository = ReturnType<typeof createBackupRunsRepository>;

/** The run-row repository: query/mutate methods over `backupRunsTable`. */
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
     * Apply a status transition, returning the updated row — or `null` when
     * the row has vanished underneath us. Deliberately not `repository.update`,
     * which throws on a missing row.
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
     * to rotation, which keeps the head and drops the tail. `pre-restore`
     * snapshots are excluded, since they must never be rotated or count against `keep`.
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
