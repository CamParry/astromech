/**
 * Version history. A version snapshots the content row an update replaces, so
 * the sequence runs per item and locale, and replacing the file — which touches
 * no content row — writes none.
 */

import type { StorageDriver } from '@/types/index';
import { createTestDb, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { MediaNotFoundError } from '@/media/errors';
import { createMediaRepository } from '@/media/repository';
import { mediaService as api } from '@/media/service';
import { setStorageDriver } from '@/storage/registry';
import { makeTranslatableMediaConfig } from './media-config';

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

let id: string;

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeTranslatableMediaConfig());
    setStorageDriver(noopStorage);
    // Authored through the repository, so the item starts with content but no
    // version: an `update` is then the first thing that replaces a state.
    const row = await createMediaRepository().create(
        { filename: 'photo.png', mimeType: 'image/png', size: 1 },
        { alt: 'first alt' }
    );
    id = row.id;
});

describe('versions', () => {
    it('snapshots the pre-update state when a versioned column changes', async () => {
        await api.update({ id, data: { alt: 'second alt' } });

        const versions = await api.versions({ id });
        expect(versions).toHaveLength(1);
        expect(versions[0]?.alt).toBe('first alt');
        expect(versions[0]?.version).toBe(1);
        expect(versions[0]?.mediaId).toBe(id);
        expect(versions[0]?.locale).toBe('en');
    });

    it('writes no version when nothing versioned changed', async () => {
        await api.update({ id, data: { alt: 'first alt' } });
        expect(await api.versions({ id })).toEqual([]);
    });

    it('lists newest first', async () => {
        for (const alt of ['b', 'c', 'd']) await api.update({ id, data: { alt } });
        const versions = await api.versions({ id });
        expect(versions.map((v) => v.version)).toEqual([3, 2, 1]);
        expect(versions.map((v) => v.alt)).toEqual(['c', 'b', 'first alt']);
    });

    it('keeps a separate sequence per locale', async () => {
        await api.update({ id, locale: 'fr', data: { alt: 'FR alt' } });
        await api.update({ id, locale: 'fr', data: { alt: 'FR alt 2' } });
        await api.update({ id, data: { alt: 'EN alt 2' } });

        const en = await api.versions({ id });
        const fr = await api.versions({ id, locale: 'fr' });
        expect(en.map((v) => v.alt)).toEqual(['first alt']);
        expect(fr.map((v) => v.alt)).toEqual(['FR alt']);
        expect(fr[0]?.locale).toBe('fr');
    });

    it('throws for a locale with no content row', async () => {
        await expect(api.versions({ id, locale: 'fr' })).rejects.toThrow(
            MediaNotFoundError
        );
    });
});

describe('restoreVersion', () => {
    it('writes the version back and snapshots the state it overwrote', async () => {
        await api.update({ id, data: { alt: 'second alt', title: 'second title' } });
        const [version] = await api.versions({ id });
        if (!version) throw new Error('expected a version');

        const restored = await api.restoreVersion({ id, versionId: version.id });
        expect(restored.alt).toBe('first alt');
        expect(restored.title).toBeNull();

        const after = await api.versions({ id });
        expect(after).toHaveLength(2);
        expect(after[0]?.alt).toBe('second alt');
        expect(after[0]?.title).toBe('second title');
    });

    it('refuses a version belonging to another locale', async () => {
        await api.update({ id, data: { alt: 'second alt' } });
        const [version] = await api.versions({ id });
        if (!version) throw new Error('expected a version');
        await api.update({ id, locale: 'fr', data: { alt: 'FR alt' } });

        await expect(
            api.restoreVersion({ id, locale: 'fr', versionId: version.id })
        ).rejects.toThrow(MediaNotFoundError);
    });

    it('refuses an unknown version id', async () => {
        await expect(api.restoreVersion({ id, versionId: 'nope' })).rejects.toThrow(
            MediaNotFoundError
        );
    });
});

describe('replace', () => {
    it('writes no version and moves the file timestamps alone', async () => {
        const before = await api.get({ id });
        await new Promise((resolve) => setTimeout(resolve, 10));

        const replaced = await api.replace({
            id,
            file: new File(['bytes' as BlobPart], 'new.png', { type: 'image/png' }),
        });

        expect(await api.versions({ id })).toEqual([]);
        expect(replaced.filename).toBe('new.png');
        expect(replaced.alt).toBe('first alt');
        expect(replaced.updatedAt.getTime()).toBeGreaterThan(
            before?.updatedAt.getTime() ?? 0
        );
    });
});
