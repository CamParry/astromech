/**
 * Translation of the content columns media has and other resources do not
 * (`title`, `alt`, `caption`): they fall back, seed a new locale and read back
 * from query like its fields. The rules media shares with users are in
 * `tests/content/resource-translation.test.ts`.
 */

import { createTestDb, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { currentServices } from '@/app-context/services';
import { mediaRepository } from '@/media/repository';
import { makeTranslatableMediaConfig } from './media-config';

const api = currentServices.media;

let id: string;

/** One media item with its default-locale content already authored. */
async function seed(): Promise<string> {
    const row = await mediaRepository.create(
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
    id = await seed();
});

describe('reading a locale with no content row', () => {
    it('falls back to the default locale’s content columns', async () => {
        const fr = await api.get({ id, locale: 'fr' });
        expect(fr?.locale).toBe('en');
        expect(fr?.locales).toEqual(['en']);
        expect(fr?.title).toBe('EN title');
        expect(fr?.fields['credit']).toBe('EN credit');
    });

    it('lists the default locale’s content columns in the query', async () => {
        const { data } = await api.query({ locale: 'fr' });
        expect(data).toHaveLength(1);
        expect(data[0]?.locale).toBe('en');
        expect(data[0]?.alt).toBe('EN alt');
    });
});

describe('writing a locale with no content row', () => {
    it('seeds a new locale’s content columns from the default locale', async () => {
        const fr = await api.update({ id, locale: 'fr', data: { alt: 'FR alt' } });

        expect(fr.locale).toBe('fr');
        expect(fr.locales).toEqual(['en', 'fr']);
        expect(fr.alt).toBe('FR alt');
        // Copied from the default-locale row, not blanked.
        expect(fr.title).toBe('EN title');
        expect(fr.caption).toBe('EN caption');
        expect(fr.fields).toEqual({ credit: 'EN credit', internalRef: 'REF-1' });
    });

    it('reads a translated content column back from query', async () => {
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
