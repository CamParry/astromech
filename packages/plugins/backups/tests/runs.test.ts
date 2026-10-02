/**
 * Taking, downloading and deleting a backup through the plugin's public
 * surface: the `run` and `delete` service methods and the download raw route,
 * on the harness database with the site's storage on the filesystem driver.
 */

import type { PluginTestApp } from '@tests/plugin-app';
import { gunzipSync } from 'node:zlib';
import { makeUser, roleWith } from '@tests/fixtures';
import { beforeEach, describe, expect, it } from 'vitest';
import { backups } from '../src/index';
import { artifactKey, createBackupsApp, takeBackup } from './_support/backups-app';

let app: PluginTestApp<'backups'>;

beforeEach(async () => {
    app = await createBackupsApp();
});

describe('backups.run', () => {
    it('stores a backup and records a successful manual run', async () => {
        const run = await takeBackup(app);

        expect(run).toMatchObject({ status: 'success', trigger: 'manual', error: null });
        const stored = await app.context().storage.get(artifactKey(run));
        expect(stored?.size).toBe(run.sizeBytes);
        const { runs } = await app.service.list();
        expect(runs.map((listed) => listed.id)).toEqual([run.id]);
    });

    it('answers already-running and records nothing while a backup is in flight', async () => {
        globalThis.__astromechBackupRunning = true;

        expect(await app.service.run()).toEqual({ ok: false, reason: 'already-running' });
        expect((await app.service.list()).runs).toEqual([]);
    });
});

describe('GET /plugins/backups/runs/:id/download', () => {
    const downloader = roleWith(backups.permissions('download'));

    it('returns the stored backup as a gzip attachment', async () => {
        const run = await takeBackup(app);
        const key = artifactKey(run);

        const res = await app.request('GET', `/plugins/backups/runs/${run.id}/download`, {
            as: { user: makeUser(), role: downloader },
        });

        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('application/gzip');
        expect(res.headers.get('Content-Disposition')).toBe(
            `attachment; filename="${key}"`
        );
        const body = new Uint8Array(await res.arrayBuffer());
        const stored = await app.context().storage.get(key);
        expect(body).toEqual(
            new Uint8Array(await new Response(stored?.body).arrayBuffer())
        );
        // The artifact is a gzipped SQLite database file.
        expect(gunzipSync(body).subarray(0, 16).toString('latin1')).toBe(
            'SQLite format 3\0'
        );
    });

    it('answers 404 for a run that does not exist', async () => {
        const res = await app.request(
            'GET',
            '/plugins/backups/runs/no-such-run/download',
            {
                as: { user: makeUser(), role: downloader },
            }
        );

        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: 'Backup run not found' });
    });

    it('answers 410 once the artifact is gone from storage', async () => {
        const run = await takeBackup(app);
        await app.context().storage.delete(artifactKey(run));

        const res = await app.request('GET', `/plugins/backups/runs/${run.id}/download`, {
            as: { user: makeUser(), role: downloader },
        });

        expect(res.status).toBe(410);
    });
});

describe('backups.delete', () => {
    it('removes the stored backup and its run', async () => {
        const run = await takeBackup(app);
        const key = artifactKey(run);

        expect(await app.service.delete({ id: run.id })).toEqual({
            ok: true,
            id: run.id,
        });

        expect(await app.context().storage.get(key)).toBeNull();
        expect((await app.service.list()).runs).toEqual([]);
    });

    it('leaves other backups in place', async () => {
        const kept = await takeBackup(app);
        const deleted = await takeBackup(app);

        await app.service.delete({ id: deleted.id });

        expect(await app.context().storage.get(artifactKey(kept))).not.toBeNull();
        expect((await app.service.list()).runs.map((run) => run.id)).toEqual([kept.id]);
    });

    it('answers not-found for a run that does not exist', async () => {
        expect(await app.service.delete({ id: 'no-such-run' })).toEqual({
            ok: false,
            reason: 'not-found',
        });
    });
});
