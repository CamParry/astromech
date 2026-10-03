/**
 * Restoring a backup through `POST /plugins/backups/runs/:id/restore` on the
 * harness database: content written before the backup comes back, migrated to
 * the site's schema, and the run history survives the restore.
 */

import type { PluginTestApp } from '@tests/plugin-app';
import type { Migration, MigrationProvider } from 'kysely/migration';
import { gzipSync } from 'node:zlib';
import { expectConsole } from '@tests/console';
import { makeUser, roleWith } from '@tests/fixtures';
import { testMigrationProvider } from '@tests/test-db';
import { sql } from 'kysely';
import { Migrator } from 'kysely/migration';
import { beforeEach, describe, expect, it } from 'vitest';
import { setMigrationProvider } from '@/database/migration-registry';
import { purgePlugin } from '@/transport/cli/commands/plugin-purge';
import { backups } from '../src/index';
import { artifactKey, createBackupsApp, takeBackup } from './_support/backups-app';

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

/** The prefix the merged chain gives every forms plugin migration. */
const FORMS_PREFIX = 'plugin_forms_';

/** The forms plugin's migration names in the harness chain, sorted. */
async function formsMigrationNames(): Promise<string[]> {
    const all = await testMigrationProvider.getMigrations();
    return Object.keys(all)
        .filter((name) => name.startsWith(FORMS_PREFIX))
        .sort();
}

/** Remove the forms plugin's tables and ledger rows with `plugin:purge`. */
async function purgeFormsPlugin(): Promise<void> {
    await purgePlugin(app.db, '@astromech/forms');
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

    it('refuses a backup holding a plugin since removed and purged, and changes nothing', async () => {
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
        await purgeFormsPlugin();
        setMigrationProvider(chainWithout(FORMS_PREFIX));
        const forms = await formsMigrationNames();

        const res = await restore(backupId);

        expect(res.status).toBe(409);
        expect(await res.json()).toEqual({
            error:
                `the backup records ${forms.length === 1 ? 'a migration' : 'migrations'} ` +
                `this site does not have (${forms.join(', ')}): restore it with the ` +
                'code and plugins that wrote it',
            details: { onlyInBackup: forms },
        });
        expect(
            (await app.entries.get({ type: 'note', id: note.id, full: true }))?.title
        ).toBe('Changed');
    });

    // The plugin's tables and ledger rows stay in the database until
    // `plugin:purge`, and a backup from before it was installed lacks them.
    it('refuses a backup from before a plugin was installed while that plugin awaits its purge', async () => {
        await purgeFormsPlugin();
        const note = await app.entries.create({
            type: 'note',
            data: { title: 'Original' },
        });
        const backupId = (await takeBackup(app)).id;
        const reinstalled = await new Migrator({
            db: app.db,
            provider: testMigrationProvider,
            allowUnorderedMigrations: true,
        }).migrateToLatest();
        expect(reinstalled.error).toBeUndefined();
        await app.entries.update({
            type: 'note',
            id: note.id,
            data: { title: 'Changed' },
        });
        setMigrationProvider(chainWithout(FORMS_PREFIX));
        const forms = await formsMigrationNames();

        const res = await restore(backupId);

        expect(res.status).toBe(409);
        expect(await res.json()).toEqual({
            error:
                "the database does not match this site's migrations (only in the " +
                `database: ${forms.join(', ')}, run \`astromech plugin:purge\`)`,
            details: { onlyInDatabase: forms },
        });
        expect(
            (await app.entries.get({ type: 'note', id: note.id, full: true }))?.title
        ).toBe('Changed');
        const { rows } = await sql<{ name: string }>`
            SELECT name FROM kysely_migration WHERE name LIKE ${`${FORMS_PREFIX}%`} ORDER BY name
        `.execute(app.db);
        expect(rows.map((row) => row.name)).toEqual(forms);
    });

    // The backup is the caller's choice, so a stored file that is not a site's
    // database is refused as their bad input rather than logged as a failure.
    it('answers 422 for a backup that is not a SQLite database, and changes nothing', async () => {
        const note = await app.entries.create({
            type: 'note',
            data: { title: 'Original' },
        });
        const run = await takeBackup(app);
        await app
            .context()
            .storage.put(
                artifactKey(run),
                gzipSync(new TextEncoder().encode('not a database'))
            );

        const res = await restore(run.id);

        expect(res.status).toBe(422);
        expect(await res.json()).toEqual({
            error: 'the backup is not a SQLite database',
            details: { fields: { _: ['the backup is not a SQLite database'] } },
        });
        expect(
            (await app.entries.get({ type: 'note', id: note.id, full: true }))?.title
        ).toBe('Original');
    });

    it('answers 500, logs the failure and changes nothing when the stored backup cannot be read', async () => {
        expectConsole('error', 'Restore failed');
        const note = await app.entries.create({
            type: 'note',
            data: { title: 'Original' },
        });
        const run = await takeBackup(app);
        await app
            .context()
            .storage.put(artifactKey(run), new TextEncoder().encode('not gzip'));

        const res = await restore(run.id);

        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({ error: expect.any(String) });
        expect(
            (await app.entries.get({ type: 'note', id: note.id, full: true }))?.title
        ).toBe('Original');
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
