/**
 * `where: { references: { path, id } }` — the filter-by-relation predicate and
 * the query-time path validation that stops a typo degrading to "no results".
 *
 * The `article` type declares a relation at the top level (`author`) and two
 * inside a repeater (`sections[].related`, `sections[].gallery`) so a nested
 * schema path is exercised end to end.
 */

import type { AstromechConfig } from '@/types/index';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { currentServices } from '@/app-context/services';
import { InvalidReferencesFilterError, UnknownWhereKeyError } from '@/entries/errors';
import { UnknownSortKeyError } from '@/errors/query';
import { mediaRepository } from '@/media/repository';

const api = currentServices.entries;

function makeReferencesConfig(): AstromechConfig {
    const base = makeTestConfig();
    return {
        ...base,
        entries: {
            ...base.entries,
            article: {
                single: 'Article',
                plural: 'Articles',
                staging: true,
                fields: [
                    {
                        name: 'author',
                        type: 'relationship',
                        label: 'Author',
                        target: 'post',
                    },
                    {
                        name: 'sections',
                        type: 'repeater',
                        label: 'Sections',
                        fields: [
                            {
                                name: 'related',
                                type: 'relationship',
                                label: 'Related',
                                target: 'post',
                            },
                            {
                                name: 'gallery',
                                type: 'media',
                                label: 'Gallery',
                                multiple: true,
                            },
                        ],
                    },
                ],
            },
        },
    };
}

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeReferencesConfig());
});

/** A media row, inserted through the repository so no driver or real bytes are needed. */
async function createMedia(filename: string): Promise<string> {
    const row = await mediaRepository.create(
        {
            filename,
            mimeType: 'image/png',
            size: 1,
        },
        {}
    );
    return row.id;
}

describe('where.references', () => {
    it('returns only the entries referencing the target at that path', async () => {
        const target = await api.create({ type: 'post', data: { title: 'Target' } });
        const other = await api.create({ type: 'post', data: { title: 'Other' } });

        const hit = await api.create({
            type: 'article',
            data: { title: 'Hit', fields: { author: target.id } },
        });
        await api.create({
            type: 'article',
            data: { title: 'Miss', fields: { author: other.id } },
        });
        await api.create({ type: 'article', data: { title: 'No relation' } });

        const result = await api.query({
            type: 'article',
            full: true,
            where: { references: { path: 'author', id: target.id } },
        });

        expect(result.data.map((e) => e.id)).toEqual([hit.id]);
    });

    it('matches a nested schema path', async () => {
        const target = await api.create({ type: 'post', data: { title: 'Target' } });
        const hit = await api.create({
            type: 'article',
            data: { title: 'Hit', fields: { sections: [{ related: target.id }] } },
        });
        await api.create({
            type: 'article',
            data: { title: 'Top-level only', fields: { author: target.id } },
        });

        const result = await api.query({
            type: 'article',
            full: true,
            where: { references: { path: 'sections[].related', id: target.id } },
        });

        expect(result.data.map((e) => e.id)).toEqual([hit.id]);
    });

    it('matches a media relation nested in a repeater', async () => {
        // Real media rows: the write path prunes an id nothing exists behind.
        const one = await createMedia('one.png');
        const two = await createMedia('two.png');
        const hit = await api.create({
            type: 'article',
            data: { title: 'Gallery', fields: { sections: [{ gallery: [one, two] }] } },
        });

        const result = await api.query({
            type: 'article',
            full: true,
            where: { references: { path: 'sections[].gallery', id: two } },
        });

        expect(result.data.map((e) => e.id)).toEqual([hit.id]);
    });

    it('does not match an entry referencing a different target', async () => {
        const target = await api.create({ type: 'post', data: { title: 'Target' } });
        const other = await api.create({ type: 'post', data: { title: 'Other' } });
        await api.create({
            type: 'article',
            data: { title: 'Other-referencing', fields: { author: other.id } },
        });

        const result = await api.query({
            type: 'article',
            full: true,
            where: { references: { path: 'author', id: target.id } },
        });

        expect(result.data).toEqual([]);
    });

    it('returns an entry whose staged change holds the reference, once', async () => {
        const target = await api.create({ type: 'post', data: { title: 'Target' } });
        const canonical = await api.create({
            type: 'article',
            data: { title: 'Canonical' },
        });
        await api.createStaged({ type: 'article', id: canonical.id });
        await api.update({
            type: 'article',
            id: canonical.id,
            staged: true,
            data: { fields: { author: target.id } },
        });

        const result = await api.query({
            type: 'article',
            full: true,
            where: { references: { path: 'author', id: target.id } },
        });

        // The index is keyed on the entry, and the staged row is one of its
        // content rows; the query still returns the canonical row alone.
        expect(result.data.map((e) => e.id)).toEqual([canonical.id]);
    });

    it('reports a pagination total that reflects the filter', async () => {
        const target = await api.create({ type: 'post', data: { title: 'Target' } });
        for (const title of ['a', 'b', 'c']) {
            await api.create({
                type: 'article',
                data: { title, fields: { author: target.id } },
            });
        }
        await api.create({ type: 'article', data: { title: 'unrelated' } });

        const result = await api.query({
            type: 'article',
            full: true,
            limit: 2,
            where: { references: { path: 'author', id: target.id } },
        });

        expect(result.data).toHaveLength(2);
        expect(result.pagination?.total).toBe(3);
        expect(result.pagination?.pages).toBe(2);
    });
});

describe('where.references validation', () => {
    it('throws for a path no queried type declares, naming the path', async () => {
        const target = await api.create({ type: 'post', data: { title: 'Target' } });

        await expect(
            api.query({
                type: 'article',
                full: true,
                where: { references: { path: 'auther', id: target.id } },
            })
        ).rejects.toThrow(InvalidReferencesFilterError);

        await expect(
            api.query({
                type: 'article',
                full: true,
                where: { references: { path: 'auther', id: target.id } },
            })
        ).rejects.toThrow(/auther/);
    });

    it('lists the known relationship paths in the message', async () => {
        const error = await api
            .query({
                type: 'article',
                full: true,
                where: { references: { path: 'nope', id: 'x' } },
            })
            .then(
                () => null,
                (e: unknown) => e as InvalidReferencesFilterError
            );

        expect(error?.knownPaths).toEqual([
            'author',
            'sections[].related',
            'sections[].gallery',
        ]);
        expect(error?.message).toContain('sections[].related');
    });

    it('accepts a cross-type query where only one type declares the path', async () => {
        const target = await api.create({ type: 'post', data: { title: 'Target' } });
        const hit = await api.create({
            type: 'article',
            data: { title: 'Hit', fields: { author: target.id } },
        });

        const result = await api.query({
            type: ['article', 'note'],
            full: true,
            where: { references: { path: 'author', id: target.id } },
        });

        expect(result.data.map((e) => e.id)).toEqual([hit.id]);
    });

    it('throws for a malformed filter with empty strings', async () => {
        await expect(
            api.query({
                type: 'article',
                full: true,
                where: { references: { path: '', id: '' } },
            })
        ).rejects.toThrow(InvalidReferencesFilterError);
    });
});

describe('where with an unrecognized key', () => {
    it('refuses `_search`, which is `search` spelled as a where key', async () => {
        await expect(
            api.query({ type: 'post', full: true, where: { _search: 'x' } })
        ).rejects.toThrow(UnknownWhereKeyError);
    });

    it('throws rather than silently returning every row', async () => {
        await api.create({ type: 'post', data: { title: 'Target' } });

        await expect(
            api.query({
                type: 'post',
                full: true,
                where: { category: 'some-id' },
            })
        ).rejects.toThrow(UnknownWhereKeyError);

        await expect(
            api.query({
                type: 'post',
                full: true,
                where: { category: 'some-id' },
            })
        ).rejects.toThrow(/category/);
    });
});

describe('sort naming a field outside the allowlist', () => {
    it('throws rather than silently answering the default order', async () => {
        await api.create({ type: 'post', data: { title: 'Target' } });

        await expect(
            api.query({ type: 'post', full: true, sort: { id: 'asc' } })
        ).rejects.toThrow(UnknownSortKeyError);
    });

    it('names the key and the sortable fields', async () => {
        await expect(
            api.query({ type: 'post', full: true, sort: [{ id: 'asc' }] })
        ).rejects.toThrow(/'id'.*Sortable fields are 'title'/s);
    });
});
