/**
 * Version history a user has and other resources do not: an account-only change
 * touches no content row, so it writes no version. The rules every resource
 * shares are in `tests/content/resource-versions.test.ts`.
 */

import { createTestDb, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { currentServices } from '@/app-context/services';
import { makeTranslatableUsersConfig } from './users-config';

const api = currentServices.users;

let id: string;

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeTranslatableUsersConfig());
    const user = await api.create({
        data: { email: 'ann@test.dev', name: 'Ann', fields: { bio: 'first bio' } },
    });
    id = user.id;
});

describe('versions', () => {
    it('writes no version when only the `users` row changes', async () => {
        await api.update({ id, data: { name: 'Annabel' } });
        expect(await api.versions({ id })).toEqual([]);
    });
});
