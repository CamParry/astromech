/**
 * Translation: a media item's second locale is created by writing it, seeded
 * from the default-locale row, and a read of a locale with no row falls back to
 * the default. Non-translatable media refuses any locale but the default.
 */

import type { StorageDriver } from '@/types/index';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { MediaValidationError } from '@/media/errors';
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

/** One media item with its default-locale content already authored. */
async function seed(): Promise<string> {
    const row = await createMediaRepository().create(
        { filename: 'photo.png', mimeType: 'image/png', size: 1 },
        {}
    );
    await api.update({
        id: row.id,
        data: {
            title: 'EN title',
            alt: 'EN alt',
            caption: 'EN caption',
            fields: { credit: 'EN credit', internalRef: 'REF-1' },
        },
    });
    return row.id;
}

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeTranslatableMediaConfig());
    setStorageDriver(noopStorage);
    id = await seed();
});

describe('reading a locale with no content row', () => {
    it('falls back to the default locale and says so', async () => {
        const fr = await api.get({ id, locale: 'fr' });
        expect(fr?.locale).toBe('en');
        expect(fr?.locales).toEqual(['en']);
        expect(fr?.title).toBe('EN title');
        expect(fr?.fields['credit']).toBe('EN credit');
    });

    it('lists the item in the query too', async () => {
        const { data } = await api.query({ locale: 'fr' });
        expect(data).toHaveLength(1);
        expect(data[0]?.locale).toBe('en');
        expect(data[0]?.alt).toBe('EN alt');
    });
});

describe('writing a locale with no content row', () => {
    it('creates the row as a copy with the patch applied over it', async () => {
        const fr = await api.update({ id, locale: 'fr', data: { alt: 'FR alt' } });

        expect(fr.locale).toBe('fr');
        expect(fr.locales).toEqual(['en', 'fr']);
        expect(fr.alt).toBe('FR alt');
        // Copied from the default-locale row, not blanked.
        expect(fr.title).toBe('EN title');
        expect(fr.caption).toBe('EN caption');
        expect(fr.fields).toEqual({ credit: 'EN credit', internalRef: 'REF-1' });
    });

    it('leaves the default locale alone', async () => {
        await api.update({ id, locale: 'fr', data: { alt: 'FR alt' } });
        const en = await api.get({ id });
        expect(en?.alt).toBe('EN alt');
        expect(en?.locale).toBe('en');
    });

    it('reads the translated content back from query', async () => {
        await api.update({
            id,
            locale: 'fr',
            data: { title: 'FR title', fields: { credit: 'FR credit' } },
        });

        const { data } = await api.query({ locale: 'fr' });
        expect(data[0]?.locale).toBe('fr');
        expect(data[0]?.title).toBe('FR title');
        expect(data[0]?.fields['credit']).toBe('FR credit');
        // The file columns still come from the resource row.
        expect(data[0]?.filename).toBe('photo.png');
    });
});

describe('shared fields', () => {
    it('propagates a translatable: false field to the other locales', async () => {
        await api.update({ id, locale: 'fr', data: { fields: { credit: 'FR credit' } } });

        await api.update({ id, data: { fields: { internalRef: 'REF-2' } } });

        const fr = await api.get({ id, locale: 'fr' });
        expect(fr?.fields['internalRef']).toBe('REF-2');
        expect(fr?.fields['credit']).toBe('FR credit');
    });

    it('does not propagate a per-locale field', async () => {
        await api.update({ id, locale: 'fr', data: { fields: { credit: 'FR credit' } } });

        await api.update({ id, data: { fields: { credit: 'EN credit v2' } } });

        const fr = await api.get({ id, locale: 'fr' });
        expect(fr?.fields['credit']).toBe('FR credit');
    });
});

describe('non-translatable media', () => {
    it('rejects a locale other than the default', async () => {
        setupTestConfig(makeTestConfig());

        await expect(api.update({ id, locale: 'de', data: {} })).rejects.toThrow(
            MediaValidationError
        );

        try {
            await api.get({ id, locale: 'de' });
            expect.unreachable('non-translatable media must refuse another locale');
        } catch (error) {
            expect((error as MediaValidationError).form).toEqual([
                "Media is not translatable, so only the 'en' locale can be written.",
            ]);
        }
    });

    it('accepts the default locale named explicitly', async () => {
        setupTestConfig(makeTestConfig());
        const saved = await api.update({ id, locale: 'en', data: { alt: 'still en' } });
        expect(saved.locale).toBe('en');
    });
});
