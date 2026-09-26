/**
 * Reading a user whose content rows do not cover the asked locale. A fallback
 * read tries the asked locale, then the fallback, then any locale the user has;
 * a `users` row with no content row at all reads as null.
 */

import type { DB } from '@/database/types';
import type { Kysely } from 'kysely';
import { createTestDb, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { currentServices } from '@/app-context/services';
import { encodeWith } from '@/database/codec';
import { usersTable } from '@/database/tables';
import { ResourceNotFoundError } from '@/errors/resource';
import { DEFAULT_ROLE_SLUG } from '@/permissions/roles';
import { userRepository } from '@/users/repository';

const api = currentServices.users;

let db: Kysely<DB>;
let id: string;

/** The `users` row alone, with no content row. */
async function insertUserRow(): Promise<string> {
    const row = await db
        .insertInto('users')
        .values(
            encodeWith(usersTable, {
                email: 'noprofile@test.dev',
                name: 'No Profile',
                role: DEFAULT_ROLE_SLUG,
            })
        )
        .returningAll()
        .executeTakeFirstOrThrow();
    return String(row.id);
}

beforeEach(async () => {
    db = await createTestDb();
    setupTestConfig();
    id = await insertUserRow();
});

describe('a user with no content row', () => {
    it('reads as null through the service', async () => {
        expect(await api.get({ id })).toBeNull();
    });

    it('reads as null through the repository, with or without a fallback', async () => {
        expect(await userRepository.findOne(id)).toBeNull();
        expect(await userRepository.findOne(id, { fallbackLocale: 'en' })).toBeNull();
        expect(
            await userRepository.findOne(id, { locale: 'de', fallbackLocale: 'en' })
        ).toBeNull();
    });

    it('is not found by an update', async () => {
        await expect(
            api.update({ id, data: { fields: { bio: 'hello' } } })
        ).rejects.toThrow(ResourceNotFoundError);
    });
});

describe('a user with a content row in a non-default locale only', () => {
    beforeEach(async () => {
        await userRepository.update({ id, locale: 'de' }, { fields: { bio: 'DE bio' } });
    });

    it('reads that locale when neither the asked nor the fallback locale has a row', async () => {
        const resource = await userRepository.findOne(id, { fallbackLocale: 'en' });
        expect(resource?.locale).toBe('de');
        expect(resource?.locales).toEqual(['de']);
        expect(resource?.fields['bio']).toBe('DE bio');
    });

    it('reads as null without a fallback locale', async () => {
        expect(await userRepository.findOne(id)).toBeNull();
    });

    it('reads through the service in that locale', async () => {
        const user = await api.get({ id });
        expect(user?.name).toBe('No Profile');
        expect(user?.locale).toBe('de');
        expect(user?.fields['bio']).toBe('DE bio');
    });
});
