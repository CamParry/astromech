/**
 * The last-admin guard holds in the users service, so demoting or deleting the
 * only admin is refused over the scoped handle and the trusted service alike.
 */

import type { Db } from '@/database/types';
import { adminRole } from '@tests/fixtures';
import { contextAs, createTestDb, createTestUser, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { usersService } from '@/app-context/services';
import { scopedServices } from '@/policies/scoped-services';
import { LastAdminError } from '@/users/errors';

let db: Db;

beforeEach(async () => {
    db = await createTestDb();
    setupTestConfig();
});

describe('the only admin', () => {
    it('cannot be demoted through the scoped handle', async () => {
        const admin = await createTestUser(db, { role: 'admin' });

        await expect(
            scopedServices(contextAs(adminRole)).users.update({
                id: admin.id,
                data: { role: 'editor' },
            })
        ).rejects.toMatchObject({
            name: 'LastAdminError',
            message: 'Cannot remove the last administrator',
        });
        expect((await usersService.get({ id: admin.id }))?.role).toBe('admin');
    });

    it('cannot be deleted through the trusted service', async () => {
        const admin = await createTestUser(db, { role: 'admin' });

        await expect(usersService.delete({ id: admin.id })).rejects.toBeInstanceOf(
            LastAdminError
        );
        expect(await usersService.get({ id: admin.id })).not.toBeNull();
    });

    it('keeps its role through an update that does not change it', async () => {
        const admin = await createTestUser(db, { role: 'admin' });

        const updated = await usersService.update({
            id: admin.id,
            data: { name: 'Renamed', role: 'admin' },
        });
        expect(updated.name).toBe('Renamed');
    });
});

describe('an admin with another beside it', () => {
    it('can be demoted and deleted', async () => {
        const first = await createTestUser(db, { role: 'admin' });
        const second = await createTestUser(db, { role: 'admin' });

        await usersService.update({ id: first.id, data: { role: 'editor' } });
        await expect(usersService.delete({ id: second.id })).rejects.toBeInstanceOf(
            LastAdminError
        );
        await usersService.delete({ id: first.id });
        expect(await usersService.get({ id: first.id })).toBeNull();
    });
});
