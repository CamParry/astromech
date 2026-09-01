/**
 * `update` with a locale that has no content row yet writes the translation.
 *
 * The new row is built from the default-locale one: non-translatable
 * ("shared") fields are inherited from it and override whatever the caller
 * supplied, translatable ones come from the patch alone, and `create`'s
 * validation runs over the result. A non-translatable type refuses the write.
 */

import type { AstromechConfig, Entry } from '@/types/index';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { entriesService as api } from '@/entries/service';

beforeEach(async () => {
    await createTestDb();
    setupTestConfig();
});

/** An `en` post: a translatable `body` and a shared `category`. */
async function makeSource(fields: Record<string, unknown> = {}): Promise<Entry> {
    return api.create({
        type: 'post',
        data: {
            title: 'EN',
            locale: 'en',
            fields: { body: 'enbody', category: 'news', ...fields },
        },
    });
}

describe('update into a locale with no row', () => {
    it('creates the translation under the same id and inherits shared fields', async () => {
        const en = await makeSource();
        const de = await api.update({
            type: 'post',
            id: en.id,
            locale: 'de',
            data: { title: 'DE', fields: {} },
        });

        expect(de.id).toBe(en.id);
        expect(de.locale).toBe('de');
        expect(de.title).toBe('DE');
        expect(de.locales).toEqual(['de', 'en']);
        expect(de.fields).toEqual({ category: 'news' });

        const persisted = await api.get({
            type: 'post',
            id: en.id,
            locale: 'de',
            full: true,
        });
        expect(persisted?.fields['category']).toBe('news');
        // The default-locale row is untouched.
        const source = await api.get({ type: 'post', id: en.id, full: true });
        expect(source?.title).toBe('EN');
        expect(source?.fields['body']).toBe('enbody');
    });

    it('does not inherit a translatable field', async () => {
        const en = await makeSource();
        const de = await api.update({
            type: 'post',
            id: en.id,
            locale: 'de',
            data: { fields: { body: 'debody' } },
        });

        expect(de.fields['body']).toBe('debody');
    });

    it('overrides a supplied non-translatable value with the stored one', async () => {
        const en = await makeSource();
        const de = await api.update({
            type: 'post',
            id: en.id,
            locale: 'de',
            data: { fields: { body: 'debody', category: 'typed-by-hand' } },
        });

        expect(de.fields).toEqual({ body: 'debody', category: 'news' });
    });

    it('leaves a supplied value intact when the default locale lacks the key', async () => {
        const en = await api.create({
            type: 'post',
            data: { title: 'EN', locale: 'en', fields: { body: 'enbody' } },
        });
        const de = await api.update({
            type: 'post',
            id: en.id,
            locale: 'de',
            data: { fields: { category: 'news' } },
        });

        expect(de.fields).toEqual({ category: 'news' });
    });

    it('takes the default locale’s title and slug when the patch names neither', async () => {
        const en = await api.create({
            type: 'post',
            data: { title: 'Shared title', slug: 'shared-title', locale: 'en' },
        });
        const de = await api.update({
            type: 'post',
            id: en.id,
            locale: 'de',
            data: { fields: {} },
        });

        expect(de.title).toBe('Shared title');
        // Slug uniqueness is per (type, locale), so the copy keeps it as-is.
        expect(de.slug).toBe('shared-title');
    });

    it('refuses a non-default locale on a type that is not translatable', async () => {
        const note = await api.create({
            type: 'note',
            data: { title: 'First', fields: { body: 'x' } },
        });

        await expect(
            api.update({
                type: 'note',
                id: note.id,
                locale: 'de',
                data: { fields: {} },
            })
        ).rejects.toMatchObject({ name: 'ValidationError' });

        expect(await api.get({ type: 'note', id: note.id, locale: 'de' })).toBeNull();
    });

    it('throws when the entry itself does not exist', async () => {
        await expect(
            api.update({
                type: 'post',
                id: 'nope',
                locale: 'de',
                data: { fields: {} },
            })
        ).rejects.toThrow(/not found/);
    });
});

describe('update of an existing locale', () => {
    it('propagates a shared field to the entry’s other locales', async () => {
        const en = await makeSource();
        await api.update({
            type: 'post',
            id: en.id,
            locale: 'de',
            data: { fields: { body: 'debody' } },
        });

        await api.update({
            type: 'post',
            id: en.id,
            data: { fields: { category: 'sport' } },
        });

        const de = await api.get({
            type: 'post',
            id: en.id,
            locale: 'de',
            full: true,
        });
        expect(de?.fields['category']).toBe('sport');
        expect(de?.fields['body']).toBe('debody');
    });
});

/** `category` becomes a required non-translatable field on `post`. */
function makeRequiredCategoryConfig(): AstromechConfig {
    const base = makeTestConfig();
    return {
        ...base,
        entries: {
            ...base.entries,
            post: {
                single: 'Post',
                plural: 'Posts',
                versioning: true,
                translatable: true,
                fields: [
                    { name: 'body', type: 'text', label: 'Body' },
                    {
                        name: 'category',
                        type: 'text',
                        label: 'Category',
                        translatable: false,
                        required: true,
                    },
                ],
            },
        },
    };
}

describe('inherited value is validated', () => {
    it('satisfies a required non-translatable field on publish', async () => {
        setupTestConfig(makeRequiredCategoryConfig());
        const en = await api.create({
            type: 'post',
            data: {
                title: 'EN',
                locale: 'en',
                status: 'published',
                fields: { body: 'enbody', category: 'news' },
            },
        });
        const de = await api.update({
            type: 'post',
            id: en.id,
            locale: 'de',
            data: { title: 'DE', status: 'published', fields: { body: 'debody' } },
        });

        expect(de.fields['category']).toBe('news');
        expect(de.status).toBe('published');
    });
});
