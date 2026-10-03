/**
 * Restoring a backup through `POST /plugins/backups/runs/:id/restore` on the
 * harness database: content written before the backup comes back, and the
 * run history survives the restore.
 */

import type { PluginTestApp } from '@tests/plugin-app';
import { expectConsole } from '@tests/console';
import { makeUser, roleWith } from '@tests/fixtures';
import { sql } from 'kysely';
import { beforeEach, describe, expect, it } from 'vitest';
import { backups } from '../src/index';
import { createBackupsApp, takeBackup } from './_support/backups-app';

let app: PluginTestApp<'backups'>;

const restorer = roleWith(backups.permissions('restore'));

beforeEach(async () => {
    app = await createBackupsApp();
});

function restore(id: string): Promise<Response> {
    return app.request('POST', `/plugins/backups/runs/${id}/restore`, {
        as: { user: makeUser(), role: restorer },
    });
}

describe('POST /plugins/backups/runs/:id/restore', () => {
    it('puts back the content the backup holds', async () => {
        const note = await app.entries.create({
            type: 'note',
            data: { title: 'Original' },
        });
        const backupId = (await takeBackup(app)).id;
        await app.entries.update({
            type: 'note',
            id: note.id,
            data: { title: 'Changed' },
        });
        const added = await app.entries.create({
            type: 'note',
            data: { title: 'Added' },
        });

        const res = await restore(backupId);

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ data: { restored: backupId } });
        expect(
            (await app.entries.get({ type: 'note', id: note.id, full: true }))?.title
        ).toBe('Original');
        expect(
            await app.entries.get({ type: 'note', id: added.id, full: true })
        ).toBeNull();
    });

    it('keeps the run history and records a pre-restore snapshot', async () => {
        const backupId = (await takeBackup(app)).id;
        const laterId = (await takeBackup(app)).id;

        await restore(backupId);

        const { runs } = await app.service.list();
        expect(runs.map((run) => [run.trigger, run.status])).toEqual([
            ['pre-restore', 'success'],
            ['manual', 'success'],
            ['manual', 'success'],
        ]);
        expect(runs.slice(1).map((run) => run.id)).toEqual([laterId, backupId]);
    });

    it('refuses a backup from another schema version and changes nothing', async () => {
        const note = await app.entries.create({
            type: 'note',
            data: { title: 'Original' },
        });
        const backupId = (await takeBackup(app)).id;
        await sql`INSERT INTO kysely_migration (name, timestamp) VALUES ('9999_later', '2026-10-03T00:00:00.000Z')`.execute(
            app.db
        );
        await app.entries.update({
            type: 'note',
            id: note.id,
            data: { title: 'Changed' },
        });
        expectConsole('error', 'Restore failed');

        const res = await restore(backupId);

        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({
            error:
                'restore: the backup is from another schema version than the database ' +
                '(migrations only in the database: 9999_later)',
        });
        expect(
            (await app.entries.get({ type: 'note', id: note.id, full: true }))?.title
        ).toBe('Changed');
    });

    it('answers 404 for a run that does not exist', async () => {
        const res = await restore('no-such-run');

        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: 'Backup run not found' });
        expect((await app.service.list()).runs).toEqual([]);
    });

    it('answers 409 and changes nothing while a backup is in flight', async () => {
        const note = await app.entries.create({
            type: 'note',
            data: { title: 'Original' },
        });
        const backupId = (await takeBackup(app)).id;
        await app.entries.update({
            type: 'note',
            id: note.id,
            data: { title: 'Changed' },
        });
        globalThis.__astromechBackupRunning = true;

        const res = await restore(backupId);

        expect(res.status).toBe(409);
        expect(
            (await app.entries.get({ type: 'note', id: note.id, full: true }))?.title
        ).toBe('Changed');
    });
});
