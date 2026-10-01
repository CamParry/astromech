/**
 * Version history. A version snapshots the content row an update replaces, so
 * the sequence runs per item and locale, and replacing the file (which touches
 * no content row) writes none. A version is addressed by the item's id, the
 * locale and its number.
 */

import { createTestDb, setupTestConfig } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentServices } from '@/app-context/services';
import { ResourceNotFoundError } from '@/errors/resource';
import { mediaRepository } from '@/media/repository';
import { makeTranslatableMediaConfig } from './media-config';

const api = currentServices.media;

/** The alt text version `version` of `locale` holds. */
async function altOf(version: number, locale?: string): Promise<string | null> {
    const read = await api.getVersion({ id, version, ...(locale ? { locale } : {}) });
    return read.snapshot.alt;
}

let id: string;

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeTranslatableMediaConfig());
    // Authored through the repository, so the item starts with content but no
    // version: an `update` is then the first thing that replaces a state.
    const row = await mediaRepository.create(
        { filename: 'photo.png', mimeType: 'image/png', size: 1 },
        { alt: 'first alt' }
    );
    id = row.id;
});

afterEach(() => {
    vi.useRealTimers();
});

describe('versions', () => {
    it('snapshots the pre-update state when a versioned column changes', async () => {
        await api.update({ id, data: { alt: 'second alt' } });

        const versions = await api.versions({ id });
        expect(versions).toHaveLength(1);
        expect(versions[0]?.version).toBe(1);
        expect(versions[0]?.locale).toBe('en');
        expect(await altOf(1)).toBe('first alt');
    });

    it('lists metadata only, with no snapshot and no row id', async () => {
        await api.update({ id, data: { alt: 'second alt' } });
        const [item] = await api.versions({ id });
        expect(Object.keys(item ?? {}).sort()).toEqual([
            'createdAt',
            'createdBy',
            'locale',
            'version',
        ]);
    });

    it('writes no version when nothing versioned changed', async () => {
        await api.update({ id, data: { alt: 'first alt' } });
        expect(await api.versions({ id })).toEqual([]);
    });

    it('lists newest first', async () => {
        for (const alt of ['b', 'c', 'd']) await api.update({ id, data: { alt } });
        const versions = await api.versions({ id });
        expect(versions.map((v) => v.version)).toEqual([3, 2, 1]);
        expect(await Promise.all(versions.map((v) => altOf(v.version)))).toEqual([
            'c',
            'b',
            'first alt',
        ]);
    });

    it('keeps a separate sequence per locale', async () => {
        await api.update({ id, locale: 'fr', data: { alt: 'FR alt' } });
        await api.update({ id, locale: 'fr', data: { alt: 'FR alt 2' } });
        await api.update({ id, data: { alt: 'EN alt 2' } });

        expect((await api.versions({ id })).map((v) => v.version)).toEqual([1]);
        const fr = await api.versions({ id, locale: 'fr' });
        expect(fr.map((v) => v.version)).toEqual([1]);
        expect(fr[0]?.locale).toBe('fr');
        expect(await altOf(1)).toBe('first alt');
        expect(await altOf(1, 'fr')).toBe('FR alt');
    });

    it('throws for a locale with no content row', async () => {
        await expect(api.versions({ id, locale: 'fr' })).rejects.toThrow(
            ResourceNotFoundError
        );
    });
});

describe('getVersion', () => {
    it('answers the metadata and the snapshot, with no internal key', async () => {
        await api.update({ id, data: { alt: 'second alt', title: 'second title' } });
        const version = await api.getVersion({ id, version: 1 });
        expect(Object.keys(version).sort()).toEqual([
            'createdAt',
            'createdBy',
            'locale',
            'snapshot',
            'version',
        ]);
        expect(version.snapshot).toEqual({
            title: null,
            alt: 'first alt',
            caption: null,
            fields: {},
        });
    });

    it('refuses a number the locale has no version for', async () => {
        await expect(api.getVersion({ id, version: 1 })).rejects.toThrow(
            `Media '${id}' has no version 1 in locale 'en'`
        );
    });
});

describe('restoreVersion', () => {
    it('writes the version back and snapshots the state it overwrote', async () => {
        await api.update({ id, data: { alt: 'second alt', title: 'second title' } });
        const restored = await api.restoreVersion({ id, version: 1 });
        expect(restored.alt).toBe('first alt');
        expect(restored.title).toBeNull();

        expect((await api.versions({ id })).map((v) => v.version)).toEqual([2, 1]);
        const saved = await api.getVersion({ id, version: 2 });
        expect(saved.snapshot.alt).toBe('second alt');
        expect(saved.snapshot.title).toBe('second title');
    });

    it('refuses a number only another locale has a version for', async () => {
        await api.update({ id, data: { alt: 'second alt' } });
        await api.update({ id, locale: 'fr', data: { alt: 'FR alt' } });

        await expect(
            api.restoreVersion({ id, locale: 'fr', version: 1 })
        ).rejects.toThrow(ResourceNotFoundError);
    });

    it('refuses an unknown version number', async () => {
        await expect(api.restoreVersion({ id, version: 7 })).rejects.toThrow(
            ResourceNotFoundError
        );
    });
});

describe('replace', () => {
    it('writes no version and stamps the media row', async () => {
        const before = await api.get({ id });
        if (!before) throw new Error('expected the item');
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(before.updatedAt.getTime() + 1000);

        const replaced = await api.replace({
            id,
            file: new File(['bytes' as BlobPart], 'new.png', { type: 'image/png' }),
        });

        expect(await api.versions({ id })).toEqual([]);
        expect(replaced.filename).toBe('new.png');
        expect(replaced.alt).toBe('first alt');
        expect(replaced.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    });
});
