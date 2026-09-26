/**
 * Version history. A version snapshots the content row an update replaces, so
 * the sequence runs per user and locale, and an account-only change (which
 * touches no content row) writes none. A version is addressed by the user's id,
 * the locale and its number.
 */

import { createTestDb, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { currentServices } from '@/app-context/services';
import { ResourceNotFoundError } from '@/errors/resource';
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
    it('snapshots the pre-update fields when they change', async () => {
        await api.update({ id, data: { fields: { bio: 'second bio' } } });

        const versions = await api.versions({ id });
        expect(versions).toHaveLength(1);
        expect(versions[0]?.version).toBe(1);
        expect(versions[0]?.locale).toBe('en');

        const version = await api.getVersion({ id, version: 1 });
        expect(version.snapshot).toEqual({ fields: { bio: 'first bio' } });
    });

    it('lists metadata only, with no snapshot and no row id', async () => {
        await api.update({ id, data: { fields: { bio: 'second bio' } } });
        const [item] = await api.versions({ id });
        expect(Object.keys(item ?? {}).sort()).toEqual([
            'createdAt',
            'createdBy',
            'locale',
            'version',
        ]);
    });

    it('writes no version when only the `users` row changes', async () => {
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
        const bios = await Promise.all(
            versions.map(async (v) => {
                const read = await api.getVersion({ id, version: v.version });
                return read.snapshot.fields['bio'];
            })
        );
        expect(bios).toEqual(['c', 'b', 'first bio']);
    });

    it('keeps a separate sequence per locale', async () => {
        await api.update({ id, locale: 'fr', data: { fields: { bio: 'FR bio' } } });
        await api.update({ id, locale: 'fr', data: { fields: { bio: 'FR bio 2' } } });
        await api.update({ id, data: { fields: { bio: 'EN bio 2' } } });

        expect((await api.versions({ id })).map((v) => v.version)).toEqual([1]);
        const fr = await api.versions({ id, locale: 'fr' });
        expect(fr.map((v) => v.version)).toEqual([1]);
        expect(fr[0]?.locale).toBe('fr');

        const enFirst = await api.getVersion({ id, version: 1 });
        const frFirst = await api.getVersion({ id, locale: 'fr', version: 1 });
        expect(enFirst.snapshot.fields['bio']).toBe('first bio');
        expect(frFirst.snapshot.fields['bio']).toBe('FR bio');
        expect(frFirst.locale).toBe('fr');
    });

    it('throws for a locale with no content row', async () => {
        await expect(api.versions({ id, locale: 'fr' })).rejects.toThrow(
            ResourceNotFoundError
        );
    });
});

describe('getVersion', () => {
    it('answers the metadata and the snapshot, with no internal key', async () => {
        await api.update({ id, data: { fields: { bio: 'second bio' } } });
        const version = await api.getVersion({ id, version: 1 });
        expect(Object.keys(version).sort()).toEqual([
            'createdAt',
            'createdBy',
            'locale',
            'snapshot',
            'version',
        ]);
        expect(version).toMatchObject({ version: 1, locale: 'en' });
        expect(version.snapshot).toEqual({ fields: { bio: 'first bio' } });
    });

    it('refuses a number the locale has no version for', async () => {
        await expect(api.getVersion({ id, version: 1 })).rejects.toThrow(
            ResourceNotFoundError
        );
    });
});

describe('restoreVersion', () => {
    it('writes the version back and snapshots the state it overwrote', async () => {
        await api.update({ id, data: { fields: { bio: 'second bio' } } });
        const restored = await api.restoreVersion({ id, version: 1 });
        expect(restored.fields['bio']).toBe('first bio');

        const after = await api.versions({ id });
        expect(after.map((v) => v.version)).toEqual([2, 1]);
        const saved = await api.getVersion({ id, version: 2 });
        expect(saved.snapshot.fields).toEqual({ bio: 'second bio' });
    });

    it('refuses a number only another locale has a version for', async () => {
        await api.update({ id, data: { fields: { bio: 'second bio' } } });
        await api.update({ id, locale: 'fr', data: { fields: { bio: 'FR bio' } } });

        await expect(
            api.restoreVersion({ id, locale: 'fr', version: 1 })
        ).rejects.toThrow(ResourceNotFoundError);
    });

    it('refuses an unknown version number', async () => {
        await expect(api.restoreVersion({ id, version: 7 })).rejects.toThrow(
            `User '${id}' has no version 7 in locale 'en'`
        );
    });
});
