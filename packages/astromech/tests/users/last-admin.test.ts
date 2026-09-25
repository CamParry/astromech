/**
 * The last-admin guard holds in the users service, so demoting or deleting the
 * only admin is refused over the scoped handle and the trusted service alike.
 */

import type { Db } from '@/database/types';
import { adminRole } from '@tests/fixtures';
import { contextAs, createTestDb, createTestUser, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createServices, currentServices } from '@/app-context/services';
import { LastAdminError } from '@/users/errors';
import { userRepository } from '@/users/repository';

const usersService = currentServices.users;

let db: Db;

beforeEach(async () => {
    db = await createTestDb();
    setupTestConfig();
});

describe('the only admin', () => {
    it('cannot be demoted through the scoped handle', async () => {
        const admin = await createTestUser(db, { role: 'admin' });

        await expect(
            createServices(contextAs(adminRole), { overrideAccess: false }).users.update({
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

describe('the admin count', () => {
    it('comes from the user repository', async () => {
        const first = await createTestUser(db, { role: 'admin' });
        await createTestUser(db, { role: 'admin' });
        vi.spyOn(userRepository, 'countByRole').mockResolvedValue(1);

        await expect(usersService.delete({ id: first.id })).rejects.toBeInstanceOf(
            LastAdminError
        );
    });
});
