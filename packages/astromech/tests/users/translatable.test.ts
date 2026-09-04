/**
 * Translation: a user's second locale is created by writing it, seeded from the
 * default-locale row, and a read of a locale with no row falls back to the
 * default. Non-translatable users refuse any locale but the default.
 */

import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { UserValidationError } from '@/users/errors';
import { usersService as api } from '@/users/service';
import { makeTranslatableUsersConfig } from './users-config';

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

describe('reading a locale with no content row', () => {
    it('falls back to the default locale and says so', async () => {
        const fr = await api.get({ id, locale: 'fr' });
        expect(fr?.locale).toBe('en');
        expect(fr?.locales).toEqual(['en']);
        expect(fr?.fields['bio']).toBe('EN bio');
    });

    it('lists the user in the query too', async () => {
        const { data } = await api.query({ locale: 'fr' });
        expect(data).toHaveLength(1);
        expect(data[0]?.locale).toBe('en');
        expect(data[0]?.fields['bio']).toBe('EN bio');
    });
});

describe('writing a locale with no content row', () => {
    it('creates the row as a copy with the patch applied over it', async () => {
        const fr = await api.update({
            id,
            locale: 'fr',
            data: { fields: { bio: 'FR bio' } },
        });

        expect(fr.locale).toBe('fr');
        expect(fr.locales).toEqual(['en', 'fr']);
        expect(fr.fields).toEqual({ bio: 'FR bio', staffId: 'STAFF-1' });

        const en = await api.get({ id });
        expect(en?.fields['bio']).toBe('EN bio');
    });

    it('writes the account row without creating a content row', async () => {
        const updated = await api.update({ id, locale: 'fr', data: { name: 'Annabel' } });

        expect(updated.name).toBe('Annabel');
        // No `fr` row was written, so the read still falls back to `en`.
        expect(updated.locale).toBe('en');
        expect(updated.locales).toEqual(['en']);
    });

    it('reads the translated content back from query', async () => {
        await api.update({ id, locale: 'fr', data: { fields: { bio: 'FR bio' } } });

        const { data } = await api.query({ locale: 'fr' });
        expect(data[0]?.locale).toBe('fr');
        expect(data[0]?.fields['bio']).toBe('FR bio');
        // The account columns still come from the user row.
        expect(data[0]?.email).toBe('ann@test.dev');
    });
});

describe('shared fields', () => {
    it('propagates a translatable: false field to the other locales', async () => {
        await api.update({ id, locale: 'fr', data: { fields: { bio: 'FR bio' } } });

        await api.update({ id, data: { fields: { staffId: 'STAFF-2' } } });

        const fr = await api.get({ id, locale: 'fr' });
        expect(fr?.fields['staffId']).toBe('STAFF-2');
        expect(fr?.fields['bio']).toBe('FR bio');
    });

    it('does not propagate a per-locale field', async () => {
        await api.update({ id, locale: 'fr', data: { fields: { bio: 'FR bio' } } });

        await api.update({ id, data: { fields: { bio: 'EN bio v2' } } });

        const fr = await api.get({ id, locale: 'fr' });
        expect(fr?.fields['bio']).toBe('FR bio');
    });
});

describe('non-translatable users', () => {
    it('rejects a locale other than the default', async () => {
        setupTestConfig(makeTestConfig());

        await expect(api.update({ id, locale: 'de', data: {} })).rejects.toThrow(
            UserValidationError
        );

        try {
            await api.get({ id, locale: 'de' });
            expect.unreachable('non-translatable users must refuse another locale');
        } catch (error) {
            expect((error as UserValidationError).form).toEqual([
                "Users are not translatable, so only the 'en' locale can be written.",
            ]);
        }
    });

    it('accepts the default locale named explicitly', async () => {
        setupTestConfig(makeTestConfig());
        const saved = await api.update({ id, locale: 'en', data: { name: 'Still Ann' } });
        expect(saved.locale).toBe('en');
    });
});
