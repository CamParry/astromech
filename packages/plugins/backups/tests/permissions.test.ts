/**
 * Each backups operation refuses a role without its own permission. Service
 * methods are called on the scoped handle (`app.as`), the way a transport
 * calls them; download and restore are raw routes, sent over the HTTP app.
 * Each refusal is checked against a role that holds every other backups
 * permission, so a grant cannot leak from one operation to another.
 */

import type { PluginTestApp } from '@tests/plugin-app';
import { roleWith } from '@tests/fixtures';
import { beforeEach, describe, expect, it } from 'vitest';
import { backups } from '../src/index';
import { artifactKey, createBackupsApp, requestAsRole } from './_support/backups-app';

type BackupsPermission = 'read' | 'run' | 'download' | 'restore' | 'delete';

const ALL: BackupsPermission[] = ['read', 'run', 'download', 'restore', 'delete'];

/** A role holding every backups permission except `missing`. */
function roleWithout(missing: BackupsPermission) {
    return roleWith(backups.permissions(...ALL.filter((key) => key !== missing)));
}

let app: PluginTestApp<'backups'>;

beforeEach(async () => {
    app = await createBackupsApp();
});

/** Take a backup through the trusted service and return its run. */
async function takeBackup() {
    const result = await app.service.run();
    if (!result.ok) throw new Error(`the backup did not run: ${result.reason}`);
    return result.run;
}

describe('backups service permissions', () => {
    it('refuses list without read', async () => {
        await expect(app.as(roleWithout('read')).list()).rejects.toMatchObject({
            name: 'PermissionDeniedError',
            permission: 'plugin:backups:read',
        });
    });

    it('refuses run without run, and takes no backup', async () => {
        await expect(app.as(roleWithout('run')).run()).rejects.toMatchObject({
            name: 'PermissionDeniedError',
            permission: 'plugin:backups:run',
        });

        expect((await app.service.list()).runs).toEqual([]);
    });

    it('refuses delete without delete, and keeps the backup', async () => {
        const run = await takeBackup();

        await expect(
            app.as(roleWithout('delete')).delete({ id: run.id })
        ).rejects.toMatchObject({
            name: 'PermissionDeniedError',
            permission: 'plugin:backups:delete',
        });

        expect(await app.context().storage.get(artifactKey(run))).not.toBeNull();
        expect((await app.service.list()).runs.map((listed) => listed.id)).toEqual([
            run.id,
        ]);
    });

    it.each<
        [
            BackupsPermission,
            (handle: ReturnType<typeof app.as>) => Promise<unknown>,
            unknown,
        ]
    >([
        ['read', (handle) => handle.list(), expect.objectContaining({ runs: [] })],
        ['run', (handle) => handle.run(), expect.objectContaining({ ok: true })],
        [
            'delete',
            (handle) => handle.delete({ id: 'no-such-run' }),
            { ok: false, reason: 'not-found' },
        ],
    ])('allows a role holding only %s to call it', async (permission, call, expected) => {
        const handle = app.as(roleWith(backups.permissions(permission)));

        await expect(call(handle)).resolves.toEqual(expected);
    });
});

describe('backups raw route permissions', () => {
    it.each([
        ['download', 'GET', 'download'],
        ['restore', 'POST', 'restore'],
    ] as const)(
        'refuses %s without its permission',
        async (permission, method, action) => {
            const run = await takeBackup();

            const res = await requestAsRole(
                app,
                roleWithout(permission),
                method,
                `/plugins/backups/runs/${run.id}/${action}`
            );

            expect(res.status).toBe(403);
            // A refused restore takes no pre-restore snapshot.
            expect((await app.service.list()).runs.map((listed) => listed.id)).toEqual([
                run.id,
            ]);
        }
    );

    it.each([
        ['download', 'GET'],
        ['restore', 'POST'],
    ] as const)('refuses %s to a caller who is not signed in', async (action, method) => {
        const run = await takeBackup();

        const res = await requestAsRole(
            app,
            null,
            method,
            `/plugins/backups/runs/${run.id}/${action}`
        );

        expect(res.status).toBe(401);
    });
});
