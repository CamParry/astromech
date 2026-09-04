/**
 * Version history. A version snapshots the content row an update replaces, so
 * the sequence runs per user and locale, and an account-only change — which
 * touches no content row — writes none.
 */

import { createTestDb, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { UserNotFoundError } from '@/users/errors';
import { usersService as api } from '@/users/service';
import { makeTranslatableUsersConfig } from './users-config';

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
    it('snapshots the pre-update fields when they change', async () => {
        await api.update({ id, data: { fields: { bio: 'second bio' } } });

        const versions = await api.versions({ id });
        expect(versions).toHaveLength(1);
        expect(versions[0]?.fields).toEqual({ bio: 'first bio' });
        expect(versions[0]?.version).toBe(1);
        expect(versions[0]?.userId).toBe(id);
        expect(versions[0]?.locale).toBe('en');
    });

    it('writes no version when only the account row changes', async () => {
        await api.update({ id, data: { name: 'Annabel' } });
        expect(await api.versions({ id })).toEqual([]);
    });

    it('writes no version when the fields are unchanged', async () => {
        await api.update({ id, data: { fields: { bio: 'first bio' } } });
        expect(await api.versions({ id })).toEqual([]);
    });

    it('lists newest first', async () => {
        for (const bio of ['b', 'c', 'd'])
            await api.update({ id, data: { fields: { bio } } });
        const versions = await api.versions({ id });
        expect(versions.map((v) => v.version)).toEqual([3, 2, 1]);
        expect(versions.map((v) => v.fields?.['bio'])).toEqual(['c', 'b', 'first bio']);
    });

    it('keeps a separate sequence per locale', async () => {
        await api.update({ id, locale: 'fr', data: { fields: { bio: 'FR bio' } } });
        await api.update({ id, locale: 'fr', data: { fields: { bio: 'FR bio 2' } } });
        await api.update({ id, data: { fields: { bio: 'EN bio 2' } } });

        const en = await api.versions({ id });
        const fr = await api.versions({ id, locale: 'fr' });
        expect(en.map((v) => v.fields?.['bio'])).toEqual(['first bio']);
        expect(fr.map((v) => v.fields?.['bio'])).toEqual(['FR bio']);
        expect(fr[0]?.locale).toBe('fr');
    });

    it('throws for a locale with no content row', async () => {
        await expect(api.versions({ id, locale: 'fr' })).rejects.toThrow(
            UserNotFoundError
        );
    });
});

describe('restoreVersion', () => {
    it('writes the version back and snapshots the state it overwrote', async () => {
        await api.update({ id, data: { fields: { bio: 'second bio' } } });
        const [version] = await api.versions({ id });
        if (!version) throw new Error('expected a version');

        const restored = await api.restoreVersion({ id, versionId: version.id });
        expect(restored.fields['bio']).toBe('first bio');

        const after = await api.versions({ id });
        expect(after).toHaveLength(2);
        expect(after[0]?.fields).toEqual({ bio: 'second bio' });
    });

    it('refuses a version belonging to another locale', async () => {
        await api.update({ id, data: { fields: { bio: 'second bio' } } });
        const [version] = await api.versions({ id });
        if (!version) throw new Error('expected a version');
        await api.update({ id, locale: 'fr', data: { fields: { bio: 'FR bio' } } });

        await expect(
            api.restoreVersion({ id, locale: 'fr', versionId: version.id })
        ).rejects.toThrow(UserNotFoundError);
    });

    it('refuses an unknown version id', async () => {
        await expect(api.restoreVersion({ id, versionId: 'nope' })).rejects.toThrow(
            UserNotFoundError
        );
    });
});
