/**
 * Translation a user has and other resources do not: an account-only write to a
 * locale creates no content row there. The rules users share with media are in
 * `tests/content/resource-translation.test.ts`.
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
        data: {
            email: 'ann@test.dev',
            name: 'Ann',
            fields: { bio: 'EN bio', staffId: 'STAFF-1' },
        },
    });
    id = user.id;
});

describe('writing a locale with no content row', () => {
    it('writes the `users` row without creating a content row', async () => {
        const updated = await api.update({ id, locale: 'fr', data: { name: 'Annabel' } });

        expect(updated.name).toBe('Annabel');
        // No `fr` row was written, so the read still falls back to `en`.
        expect(updated.locale).toBe('en');
        expect(updated.locales).toEqual(['en']);
    });
});
