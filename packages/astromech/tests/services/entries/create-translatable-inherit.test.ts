/**
 * Creating an entry into an existing locale group inherits the group's
 * non-translatable ("group-shared") field values from an existing sibling,
 * overriding whatever the caller supplied for those keys.
 */

import type { AstromechConfig, Entry } from '@/types/index';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { entriesService } from '@/entries/service';

const api = entriesService;

beforeEach(async () => {
    await createTestDb();
    setupTestConfig();
});

/** Source entry of a locale group: a translatable `body` + shared `category`. */
async function makeSource(): Promise<Entry> {
    return await api.create({
        type: 'post',
        data: { title: 'EN', locale: 'en', fields: { body: 'enbody', category: 'news' } },
    });
}

describe('create into an existing locale group', () => {
    it('inherits a non-translatable field when created with empty fields', async () => {
        const en = await makeSource();
        const de = await api.create({
            type: 'post',
            data: { title: 'DE', locale: 'de', localeGroup: en.localeGroup, fields: {} },
        });

        expect(de.fields).toEqual({ category: 'news' });
        const persisted = await api.get({ type: 'post', id: de.id, full: true });
        expect(persisted?.fields['category']).toBe('news');
    });

    it('does not inherit a translatable field', async () => {
        const en = await makeSource();
        const de = await api.create({
            type: 'post',
            data: {
                title: 'DE',
                locale: 'de',
                localeGroup: en.localeGroup,
                fields: { body: 'debody' },
            },
        });

        expect(de.fields['body']).toBe('debody');
    });

    it('overrides a supplied non-translatable value with the sibling value', async () => {
        const en = await makeSource();
        const de = await api.create({
            type: 'post',
            data: {
                title: 'DE',
                locale: 'de',
                localeGroup: en.localeGroup,
                fields: { body: 'debody', category: 'typed-by-hand' },
            },
        });

        expect(de.fields).toEqual({ body: 'debody', category: 'news' });
    });

    it('leaves a supplied value intact when the sibling lacks the key', async () => {
        const en = await api.create({
            type: 'post',
            data: { title: 'EN', locale: 'en', fields: { body: 'enbody' } },
        });
        const de = await api.create({
            type: 'post',
            data: {
                title: 'DE',
                locale: 'de',
                localeGroup: en.localeGroup,
                fields: { category: 'news' },
            },
        });

        expect(de.fields).toEqual({ category: 'news' });
    });

    it('inherits nothing for an entry type that is not translatable', async () => {
        const first = await api.create({
            type: 'note',
            data: { title: 'First', locale: 'en', fields: { body: 'shared?' } },
        });
        const second = await api.create({
            type: 'note',
            data: {
                title: 'Second',
                locale: 'de',
                localeGroup: first.localeGroup,
                fields: {},
            },
        });

        expect(second.fields).toEqual({});
    });
});

describe('create without a locale group', () => {
    it('inherits nothing and keeps the supplied values', async () => {
        await makeSource();
        const fresh = await api.create({
            type: 'post',
            data: { title: 'Fresh', locale: 'de', fields: { body: 'freshbody' } },
        });

        expect(fresh.fields).toEqual({ body: 'freshbody' });
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
        const de = await api.create({
            type: 'post',
            data: {
                title: 'DE',
                locale: 'de',
                localeGroup: en.localeGroup,
                status: 'published',
                fields: { body: 'debody' },
            },
        });

        expect(de.fields['category']).toBe('news');
    });
});
