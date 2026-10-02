/**
 * Translation behaves the same on media and users, the two resources whose
 * second locale is made by writing it: the new row is seeded from the default
 * locale, a read of a locale with no row falls back to the default, a shared
 * field reaches every locale, and every locale's references are indexed.
 * Entries and globals translate through their own tests.
 */

import type { RelationshipRow } from '@/database/tables';
import type { AstromechConfig, Field, JsonObject } from '@/types/index';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { currentServices } from '@/app-context/services';
import { relationshipRepository } from '@/content/repository/relationships';
import { ResourceValidationError } from '@/errors/resource';
import { mediaRepository } from '@/media/repository';
import { rebuildRelationshipIndex } from '@/transport/cli/relationship-index';
import { userRepository } from '@/users/repository';

const entriesService = currentServices.entries;
const mediaService = currentServices.media;
const usersService = currentServices.users;

/** A resource as these checks read it. */
type Read = { locale: string; locales: string[]; fields: JsonObject } & object;

/** How the checks reach one translatable resource. */
type Adapter = {
    /** Create one whose `en` row holds `fields`. */
    create(fields: JsonObject): Promise<string>;
    /** Write `fields` to one locale of it. */
    write(id: string, fields: JsonObject, locale?: string): Promise<Read>;
    get(id: string, locale?: string): Promise<Read | null>;
    query(locale: string): Promise<Read[]>;
    /** The repository read, which falls back only when asked. */
    findOne(
        id: string,
        options: { locale: string; fallbackLocale?: string }
    ): Promise<Read | null>;
    /**
     * The locale a repository read answers when the fallback is the locale asked:
     * media stops there, and a user falls through to any locale they have.
     */
    sameLocaleFallback: string | null;
    /** A column of the resource row, which no locale owns, and its value. */
    rowColumn: [key: string, value: string];
    /** The kind the relationship index files its rows under. */
    sourceKind: 'media' | 'user';
    /** How a refused locale is explained when the resource is not translatable. */
    notTranslatable: string;
};

const ADAPTERS = {
    media: {
        async create(fields) {
            const row = await mediaRepository.create(
                { filename: 'photo.png', mimeType: 'image/png', size: 1 },
                {}
            );
            await mediaService.update({ id: row.id, data: { fields } });
            return row.id;
        },
        write: (id, fields, locale) =>
            mediaService.update({ id, ...(locale ? { locale } : {}), data: { fields } }),
        get: (id, locale) => mediaService.get({ id, ...(locale ? { locale } : {}) }),
        query: async (locale) => (await mediaService.query({ locale })).data,
        findOne: (id, options) => mediaRepository.findOne(id, options),
        sameLocaleFallback: null,
        rowColumn: ['filename', 'photo.png'],
        sourceKind: 'media',
        notTranslatable:
            "Media is not translatable, so only the 'en' locale can be written.",
    },
    user: {
        async create(fields) {
            const user = await usersService.create({
                data: { email: 'ann@test.dev', name: 'Ann', fields },
            });
            return user.id;
        },
        write: (id, fields, locale) =>
            usersService.update({ id, ...(locale ? { locale } : {}), data: { fields } }),
        get: (id, locale) => usersService.get({ id, ...(locale ? { locale } : {}) }),
        query: async (locale) => (await usersService.query({ locale })).data,
        findOne: (id, options) => userRepository.findOne(id, options),
        sameLocaleFallback: 'en',
        rowColumn: ['email', 'ann@test.dev'],
        sourceKind: 'user',
        notTranslatable:
            "User content is not translatable, so only the 'en' locale can be written.",
    },
} satisfies Record<string, Adapter>;

/** A per-locale field, a field the resource shares across locales, and a reference. */
const FIELDS: Field[] = [
    { name: 'note', type: 'text', label: 'Note' },
    { name: 'ref', type: 'text', label: 'Reference', translatable: false },
    { name: 'credit', type: 'relationship', label: 'Credit', target: 'post' },
];

function translatableConfig(): AstromechConfig {
    return {
        ...makeTestConfig(),
        locales: ['en', 'fr'],
        defaultLocale: 'en',
        media: { translatable: true, fields: FIELDS },
        users: { translatable: true, fields: FIELDS },
    };
}

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(translatableConfig());
});

describe.each(Object.entries(ADAPTERS))('%s', (_kind, adapter: Adapter) => {
    let id: string;

    beforeEach(async () => {
        id = await adapter.create({ note: 'EN note', ref: 'REF-1' });
    });

    describe('reading a locale with no content row', () => {
        it('falls back to the default locale and says so', async () => {
            const fr = await adapter.get(id, 'fr');
            expect(fr?.locale).toBe('en');
            expect(fr?.locales).toEqual(['en']);
            expect(fr?.fields['note']).toBe('EN note');
        });

        it('reads the fallback locale through the repository only when asked', async () => {
            expect(await adapter.findOne(id, { locale: 'fr' })).toBeNull();
            const fr = await adapter.findOne(id, { locale: 'fr', fallbackLocale: 'en' });
            expect(fr?.locale).toBe('en');
            expect(fr?.fields['note']).toBe('EN note');
        });

        it('answers null (media) or any locale (users) when the fallback is the locale asked', async () => {
            const fr = await adapter.findOne(id, { locale: 'fr', fallbackLocale: 'fr' });
            expect(fr === null ? null : fr.locale).toBe(adapter.sameLocaleFallback);
        });

        it('lists it in the query too', async () => {
            const data = await adapter.query('fr');
            expect(data).toHaveLength(1);
            expect(data[0]?.locale).toBe('en');
            expect(data[0]?.fields['note']).toBe('EN note');
        });
    });

    describe('writing a locale with no content row', () => {
        it('creates the row as a copy with the patch applied over it', async () => {
            const fr = await adapter.write(id, { note: 'FR note' }, 'fr');

            expect(fr.locale).toBe('fr');
            expect(fr.locales).toEqual(['en', 'fr']);
            // Copied from the default-locale row, not blanked.
            expect(fr.fields).toEqual({ note: 'FR note', ref: 'REF-1' });
        });

        it('leaves the default locale alone', async () => {
            await adapter.write(id, { note: 'FR note' }, 'fr');

            const en = await adapter.get(id);
            expect(en?.fields['note']).toBe('EN note');
            expect(en?.locale).toBe('en');
        });

        it('reads the translated content back from query', async () => {
            await adapter.write(id, { note: 'FR note' }, 'fr');

            const data = await adapter.query('fr');
            expect(data[0]?.locale).toBe('fr');
            expect(data[0]?.fields['note']).toBe('FR note');
            // The resource row's own columns are the same in every locale.
            const [column, value] = adapter.rowColumn;
            expect(data[0]).toHaveProperty(column, value);
        });
    });

    describe('shared fields', () => {
        it('propagates a translatable: false field to the other locales', async () => {
            await adapter.write(id, { note: 'FR note' }, 'fr');

            await adapter.write(id, { ref: 'REF-2' });

            const fr = await adapter.get(id, 'fr');
            expect(fr?.fields['ref']).toBe('REF-2');
            expect(fr?.fields['note']).toBe('FR note');
        });

        it('does not propagate a per-locale field', async () => {
            await adapter.write(id, { note: 'FR note' }, 'fr');

            await adapter.write(id, { note: 'EN note v2' });

            const fr = await adapter.get(id, 'fr');
            expect(fr?.fields['note']).toBe('FR note');
        });
    });

    describe('when the resource is not translatable', () => {
        beforeEach(() => {
            setupTestConfig(makeTestConfig());
        });

        it('rejects a locale other than the default', async () => {
            await expect(adapter.write(id, {}, 'de')).rejects.toThrow(
                ResourceValidationError
            );

            const refused = await adapter.get(id, 'de').catch((error: unknown) => error);
            expect(refused).toBeInstanceOf(ResourceValidationError);
            expect((refused as ResourceValidationError).form).toEqual([
                adapter.notTranslatable,
            ]);
        });

        it('accepts the default locale named explicitly', async () => {
            const saved = await adapter.write(id, { note: 'still en' }, 'en');
            expect(saved.locale).toBe('en');
        });
    });

    // The index is keyed on the resource, not on one of its content rows, so a
    // write to `fr` must not replace `en`'s references with its own.
    describe('relationships across locales', () => {
        let postA: string;
        let postB: string;

        beforeEach(async () => {
            postA = (await entriesService.create({ type: 'post', data: { title: 'A' } }))
                .id;
            postB = (await entriesService.create({ type: 'post', data: { title: 'B' } }))
                .id;
        });

        /** Its index rows' targets, sorted so two runs compare directly. */
        async function credits(): Promise<string[]> {
            const rows = await relationshipRepository.findBySource(
                id,
                adapter.sourceKind
            );
            return rows.map((row) => row.targetId).sort();
        }

        /** Every stored row, in a stable order, so a rebuild compares to the write path. */
        async function storedRows(): Promise<RelationshipRow[]> {
            const rows = await relationshipRepository.findMany();
            return rows.sort((a, b) =>
                JSON.stringify(a).localeCompare(JSON.stringify(b))
            );
        }

        it('indexes every locale', async () => {
            await adapter.write(id, { credit: postA });
            await adapter.write(id, { credit: postB }, 'fr');

            expect(await credits()).toEqual([postA, postB].sort());
        });

        it('keeps the other locale’s reference when one locale drops its own', async () => {
            await adapter.write(id, { credit: postA });
            await adapter.write(id, { credit: postB }, 'fr');

            await adapter.write(id, { credit: null }, 'fr');

            expect(await credits()).toEqual([postA]);
        });

        it('rebuilds to exactly the rows the write path stored', async () => {
            await adapter.write(id, { credit: postA });
            await adapter.write(id, { credit: postB }, 'fr');
            const written = await storedRows();

            await rebuildRelationshipIndex();

            expect(await storedRows()).toEqual(written);
        });
    });
});
