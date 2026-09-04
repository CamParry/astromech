/**
 * The locale and the versions the media routes carry.
 *
 * The service tests cover the fallback read, the translation copy and the
 * version sequence; these assert the wire reaches them: `?locale=` on the read,
 * the update and both version routes, the 404s an unknown id and a foreign
 * version give, and the grant a restore demands.
 */

import type { StorageDriver } from '@/types/index';
import { createTestDb, setupTestConfig } from '@tests/harness';
import { adminRole, mountRouter, roleWith, seedTestUser } from '@tests/mount-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMediaRepository } from '@/media/repository';
import { mediaService } from '@/media/service';
import { setStorageDriver } from '@/storage/registry';
import { mediaRouter } from '@/transport/http/routes/media';
import { makeTranslatableMediaConfig } from '../../../media/media-config';

const noopStorage: StorageDriver = {
    name: 'noop',
    async put(): Promise<void> {
        return undefined;
    },
    async get(): Promise<null> {
        return null;
    },
    async stat(): Promise<null> {
        return null;
    },
    async delete(): Promise<void> {
        return undefined;
    },
    async list(): Promise<{ keys: string[] }> {
        return { keys: [] };
    },
    getPublicUrl(key: string): string {
        return `/${key}`;
    },
};

/** The media router mounted in isolation, acting as `role`. */
function app(role = adminRole) {
    return mountRouter('/media', mediaRouter, role);
}

let id: string;

beforeEach(async () => {
    const db = await createTestDb();
    setupTestConfig(makeTranslatableMediaConfig());
    setStorageDriver(noopStorage);
    await seedTestUser(db);
    const row = await createMediaRepository().create(
        { filename: 'photo.png', mimeType: 'image/png', size: 1 },
        { alt: 'english alt' }
    );
    id = row.id;
});

/** The `data` envelope of a 200, or a failure naming the status instead. */
async function data<T>(res: Response): Promise<T> {
    expect(res.status).toBe(200);
    return ((await res.json()) as { data: T }).data;
}

describe('GET /media/:id', () => {
    it('falls back to the default locale for an untranslated item', async () => {
        const item = await data<{ locale: string; alt: string }>(
            await app().request(`/media/${id}?locale=fr`)
        );
        expect(item.locale).toBe('en');
        expect(item.alt).toBe('english alt');
    });

    it('reads the translation once one exists', async () => {
        await mediaService.update({ id, locale: 'fr', data: { alt: 'alt français' } });

        const item = await data<{ locale: string; alt: string }>(
            await app().request(`/media/${id}?locale=fr`)
        );
        expect(item.locale).toBe('fr');
        expect(item.alt).toBe('alt français');
    });
});

describe('PUT /media/:id', () => {
    it('creates the translation the locale on the URL names', async () => {
        const res = await app().request(`/media/${id}?locale=fr`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ alt: 'alt français' }),
        });

        const item = await data<{ locale: string; alt: string }>(res);
        expect(item.locale).toBe('fr');
        // The English row is untouched.
        expect((await mediaService.get({ id }))?.alt).toBe('english alt');
    });
});

describe('GET /media/:id/versions', () => {
    it('lists the versions of the locale it names', async () => {
        await mediaService.update({ id, locale: 'fr', data: { alt: 'un' } });
        await mediaService.update({ id, locale: 'fr', data: { alt: 'deux' } });

        const versions = await data<{ locale: string; alt: string }[]>(
            await app().request(`/media/${id}/versions?locale=fr`)
        );
        expect(versions).toHaveLength(1);
        expect(versions[0]?.alt).toBe('un');
        expect(versions[0]?.locale).toBe('fr');

        // The default locale has a sequence of its own, and it is empty.
        expect(await data(await app().request(`/media/${id}/versions`))).toEqual([]);
    });

    it('404s an unknown id', async () => {
        expect((await app().request('/media/nope/versions')).status).toBe(404);
    });
});

describe('POST /media/:id/versions/:versionId/restore', () => {
    it('restores the named version and returns the item', async () => {
        await mediaService.update({ id, locale: 'fr', data: { alt: 'un' } });
        await mediaService.update({ id, locale: 'fr', data: { alt: 'deux' } });
        const [version] = await mediaService.versions({ id, locale: 'fr' });

        const item = await data<{ locale: string; alt: string }>(
            await app().request(
                `/media/${id}/versions/${version?.id ?? ''}/restore?locale=fr`,
                { method: 'POST' }
            )
        );
        expect(item.alt).toBe('un');
        expect(item.locale).toBe('fr');
    });

    it('404s a version belonging to another locale', async () => {
        await mediaService.update({ id, locale: 'fr', data: { alt: 'un' } });
        await mediaService.update({ id, locale: 'fr', data: { alt: 'deux' } });
        const [version] = await mediaService.versions({ id, locale: 'fr' });

        const res = await app().request(
            `/media/${id}/versions/${version?.id ?? ''}/restore`,
            { method: 'POST' }
        );
        expect(res.status).toBe(404);
    });

    it('403s a role holding media:read alone', async () => {
        await mediaService.update({ id, locale: 'fr', data: { alt: 'un' } });
        await mediaService.update({ id, locale: 'fr', data: { alt: 'deux' } });
        const [version] = await mediaService.versions({ id, locale: 'fr' });
        const reader = roleWith(['media:read']);

        expect(
            (await app(reader).request(`/media/${id}/versions?locale=fr`)).status
        ).toBe(200);
        expect(
            (
                await app(reader).request(
                    `/media/${id}/versions/${version?.id ?? ''}/restore?locale=fr`,
                    { method: 'POST' }
                )
            ).status
        ).toBe(403);
    });
});
