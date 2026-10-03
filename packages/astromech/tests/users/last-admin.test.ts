/**
 * The last-admin guard holds in the users service, so demoting or deleting the
 * only admin is refused over the scoped handle and the trusted service alike,
 * and in the write's own `WHERE`, so two calls that each counted two admins
 * cannot remove both. The same guarded write answers 404 for a user deleted
 * after the update read them.
 */

import type { Db } from '@/database/types';
import { adminRole } from '@tests/fixtures';
import { contextAs, createTestDb, createTestUser, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createServices, currentServices } from '@/app-context/services';
import { ResourceNotFoundError } from '@/errors/resource';
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

/**
 * Two admins, each written by a call that counted both: the second call's write
 * runs after the first demoted the other admin, so its own `WHERE` refuses it.
 * The spy lets the count read the real table, then demotes the other admin
 * before the call writes, as a concurrent request would.
 */
describe('two admins written at once', () => {
    function demoteBetweenCountAndWrite(otherId: string): void {
        const countByRole = userRepository.countByRole;
        vi.spyOn(userRepository, 'countByRole').mockImplementationOnce(async (role) => {
            const count = await countByRole(role);
            await usersService.update({ id: otherId, data: { role: 'editor' } });
            return count;
        });
    }

    it('refuses the demotion that would leave none', async () => {
        const first = await createTestUser(db, { role: 'admin' });
        const second = await createTestUser(db, { role: 'admin' });
        demoteBetweenCountAndWrite(second.id);

        await expect(
            usersService.update({ id: first.id, data: { role: 'editor' } })
        ).rejects.toBeInstanceOf(LastAdminError);
        expect((await usersService.get({ id: first.id }))?.role).toBe('admin');
        expect(await userRepository.countByRole('admin')).toBe(1);
    });

    it('refuses the delete that would leave none', async () => {
        const first = await createTestUser(db, { role: 'admin' });
        const second = await createTestUser(db, { role: 'admin' });
        demoteBetweenCountAndWrite(second.id);

        await expect(usersService.delete({ id: first.id })).rejects.toBeInstanceOf(
            LastAdminError
        );
        expect((await usersService.get({ id: first.id }))?.role).toBe('admin');
        expect(await userRepository.countByRole('admin')).toBe(1);
    });
});

describe('a user deleted while an update runs', () => {
    it('is not found by the update', async () => {
        const editor = await createTestUser(db, { role: 'editor' });
        const findOne = userRepository.findOne;
        vi.spyOn(userRepository, 'findOne').mockImplementationOnce(async (...args) => {
            const found = await findOne(...args);
            await usersService.delete({ id: editor.id });
            return found;
        });

        await expect(
            usersService.update({
                id: editor.id,
                data: { name: 'Renamed', fields: {} },
            })
        ).rejects.toBeInstanceOf(ResourceNotFoundError);
        expect(await usersService.get({ id: editor.id })).toBeNull();
    });
});
