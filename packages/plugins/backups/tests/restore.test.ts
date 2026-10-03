/**
 * Restoring a backup through `POST /plugins/backups/runs/:id/restore` on the
 * harness database: content written before the backup comes back, migrated to
 * the site's schema, and the run history survives the restore.
 */

import type { PluginTestApp } from '@tests/plugin-app';
import type { Migration, MigrationProvider } from 'kysely/migration';
import { expectConsole } from '@tests/console';
import { makeUser, roleWith } from '@tests/fixtures';
import { testMigrationProvider } from '@tests/test-db';
import { sql } from 'kysely';
import { Migrator } from 'kysely/migration';
import { beforeEach, describe, expect, it } from 'vitest';
import { setMigrationProvider } from '@/database/migration-registry';
import { backups } from '../src/index';
import { createBackupsApp, takeBackup } from './_support/backups-app';

let app: PluginTestApp<'backups'>;

const restorer = roleWith(backups.permissions('restore'));

beforeEach(async () => {
    app = await createBackupsApp();
});

/** The harness's migration chain with `extra` added. */
function chainWith(extra: Record<string, Migration>): MigrationProvider {
    return {
        async getMigrations() {
            return { ...(await testMigrationProvider.getMigrations()), ...extra };
        },
    };
}

/** The harness's migration chain without the migrations named with `prefix`. */
function chainWithout(prefix: string): MigrationProvider {
    return {
        async getMigrations() {
            const all = await testMigrationProvider.getMigrations();
            return Object.fromEntries(
                Object.entries(all).filter(([name]) => !name.startsWith(prefix))
            );
        },
    };
}

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

    it('brings an older backup up to the current schema before restoring it', async () => {
        await app.entries.create({ type: 'note', data: { title: 'Original' } });
        const backupId = (await takeBackup(app)).id;
        await app.entries.create({ type: 'note', data: { title: 'Added' } });
        const current = chainWith({
            '9999_note_count': {
                async up(db) {
                    await sql`CREATE TABLE note_count AS SELECT count(*) AS total FROM entries WHERE type = 'note'`.execute(
                        db
                    );
                },
            },
        });
        const migrated = await new Migrator({
            db: app.db,
            provider: current,
            allowUnorderedMigrations: true,
        }).migrateToLatest();
        expect(migrated.error).toBeUndefined();
        setMigrationProvider(current);

        const res = await restore(backupId);

        expect(res.status).toBe(200);
        const { rows } = await sql`SELECT total FROM note_count`.execute(app.db);
        expect(rows).toEqual([{ total: 1 }]);
        const { rows: recorded } =
            await sql`SELECT name FROM kysely_migration WHERE name = '9999_note_count'`.execute(
                app.db
            );
        expect(recorded).toEqual([{ name: '9999_note_count' }]);
    });

    it('refuses a backup holding a migration this site does not have, and changes nothing', async () => {
        const note = await app.entries.create({
            type: 'note',
            data: { title: 'Original' },
        });
        await sql`INSERT INTO kysely_migration (name, timestamp) VALUES ('9999_later', '2026-10-03T00:00:00.000Z')`.execute(
            app.db
        );
        const backupId = (await takeBackup(app)).id;
        await sql`DELETE FROM kysely_migration WHERE name = '9999_later'`.execute(app.db);
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
                'the backup records a migration this site does not have (9999_later): ' +
                'restore it with the code and plugins that wrote it',
        });
        expect(
            (await app.entries.get({ type: 'note', id: note.id, full: true }))?.title
        ).toBe('Changed');
    });

    // The plugin's tables and ledger rows stay in the database until
    // `plugin:purge`, so every backup taken while it ran holds its migrations.
    it('refuses a backup from before a plugin was removed without a purge', async () => {
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
        setMigrationProvider(chainWithout('plugin_forms_'));
        expectConsole('error', 'Restore failed');

        const res = await restore(backupId);

        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({
            error:
                'the backup records a migration this site does not have ' +
                '(plugin_forms_0000_baseline): restore it with the code and plugins that wrote it',
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
