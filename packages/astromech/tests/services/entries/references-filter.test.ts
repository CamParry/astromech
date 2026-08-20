/**
 * `where: { references: { path, id } }` — the filter-by-relation predicate and
 * the query-time path validation that stops a typo degrading to "no results".
 *
 * The `article` type declares a relation at the top level (`author`) and two
 * inside a repeater (`sections[].related`, `sections[].gallery`) so a nested
 * schema path is exercised end to end.
 */

import type { AstromechConfig, PluginDefinition } from '@/types/index';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { sql } from 'kysely';
import { beforeEach, describe, expect, it } from 'vitest';
import { defineTable } from '@/database/define-table';
import {
    InvalidReferencesFilterError,
    RelationshipFilterUnsupportedError,
    UnknownSortKeyError,
    UnknownWhereKeyError,
} from '@/entries/errors';
import { tableRepository } from '@/entries/repository/table';
import { entriesService as api } from '@/entries/service';
import { createMediaRepository } from '@/media/repository';

const linksTable = defineTable('test_links', ({ col }) => ({
    id: col.id(),
    label: col.text({ notNull: true }),
    post: col.text(),
    createdAt: col.timestamp({ notNull: true, defaultNow: true }),
    updatedAt: col.timestamp({ notNull: true, defaultNow: true, onUpdate: true }),
}));

/** `links/link` is table-backed, so it has no relationships predicate to compile. */
function linksPlugin(): PluginDefinition {
    return {
        package: '@astromech/links',
        entries: [
            {
                type: 'link',
                single: 'Link',
                plural: 'Links',
                titleField: false,
                statuses: false,
                slug: false,
                trash: false,
                repository: tableRepository(linksTable),
                fields: [
                    { name: 'label', type: 'text', label: 'Label' },
                    { name: 'post', type: 'relationship', label: 'Post', target: 'post' },
                ],
            },
        ],
    };
}

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
        plugins: [linksPlugin()],
    };
}

beforeEach(async () => {
    const db = await createTestDb();
    setupTestConfig(makeReferencesConfig());
    await sql`CREATE TABLE test_links (
            id text PRIMARY KEY,
            label text NOT NULL,
            post text,
            created_at text NOT NULL,
            updated_at text NOT NULL
        )`.execute(db);
});

/** A media row, inserted through storage so no driver or real bytes are needed. */
async function createMedia(filename: string): Promise<string> {
    const row = await createMediaRepository().create({
        filename,
        mimeType: 'image/png',
        size: 1,
    });
    return row.id;
}

describe('where.references', () => {
    it('returns only the entries referencing the target at that path', async () => {
        const target = await api.create({ type: 'post', title: 'Target' });
        const other = await api.create({ type: 'post', title: 'Other' });

        const hit = await api.create({
            type: 'article',
            title: 'Hit',
            fields: { author: target.id },
        });
        await api.create({
            type: 'article',
            title: 'Miss',
            fields: { author: other.id },
        });
        await api.create({ type: 'article', title: 'No relation' });

        const result = await api.query({
            type: 'article',
            full: true,
            where: { references: { path: 'author', id: target.id } },
        });

        expect(result.data.map((e) => e.id)).toEqual([hit.id]);
    });

    it('matches a nested schema path', async () => {
        const target = await api.create({ type: 'post', title: 'Target' });
        const hit = await api.create({
            type: 'article',
            title: 'Hit',
            fields: { sections: [{ related: target.id }] },
        });
        await api.create({
            type: 'article',
            title: 'Top-level only',
            fields: { author: target.id },
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
            title: 'Gallery',
            fields: { sections: [{ gallery: [one, two] }] },
        });

        const result = await api.query({
            type: 'article',
            full: true,
            where: { references: { path: 'sections[].gallery', id: two } },
        });

        expect(result.data.map((e) => e.id)).toEqual([hit.id]);
    });

    it('does not match an entry referencing a different target', async () => {
        const target = await api.create({ type: 'post', title: 'Target' });
        const other = await api.create({ type: 'post', title: 'Other' });
        await api.create({
            type: 'article',
            title: 'Other-referencing',
            fields: { author: other.id },
        });

        const result = await api.query({
            type: 'article',
            full: true,
            where: { references: { path: 'author', id: target.id } },
        });

        expect(result.data).toEqual([]);
    });

    it('does not return a staged source', async () => {
        const target = await api.create({ type: 'post', title: 'Target' });
        const canonical = await api.create({
            type: 'article',
            title: 'Canonical',
            fields: { author: target.id },
        });
        const staged = await api.createStaged({ type: 'article', id: canonical.id });

        const result = await api.query({
            type: 'article',
            full: true,
            where: { references: { path: 'author', id: target.id } },
        });

        // The staged copy carries its own index rows; the predicate correlates
        // on the outer row, which is already constrained to `stagedFor IS NULL`.
        expect(result.data.map((e) => e.id)).toEqual([canonical.id]);
        expect(staged.id).not.toBe(canonical.id);
    });

    it('reports a pagination total that reflects the filter', async () => {
        const target = await api.create({ type: 'post', title: 'Target' });
        for (const title of ['a', 'b', 'c']) {
            await api.create({
                type: 'article',
                title,
                fields: { author: target.id },
            });
        }
        await api.create({ type: 'article', title: 'unrelated' });

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
        const target = await api.create({ type: 'post', title: 'Target' });

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
        const target = await api.create({ type: 'post', title: 'Target' });
        const hit = await api.create({
            type: 'article',
            title: 'Hit',
            fields: { author: target.id },
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

describe('where.references on a table-backed type', () => {
    it('throws rather than returning unfiltered rows', async () => {
        const target = await api.create({ type: 'post', title: 'Target' });
        await api.create({
            type: 'links/link',
            fields: { label: 'One', post: target.id },
        });

        await expect(
            api.query({
                type: 'links/link',
                full: true,
                where: { references: { path: 'post', id: target.id } },
            })
        ).rejects.toThrow(RelationshipFilterUnsupportedError);
    });

    it('names the entry type in the error', async () => {
        await expect(
            api.query({
                type: 'links/link',
                full: true,
                where: { references: { path: 'post', id: 'x' } },
            })
        ).rejects.toThrow(/links\/link/);
    });
});

describe('where with an unrecognized key', () => {
    it('throws rather than silently returning every row', async () => {
        await api.create({ type: 'post', title: 'Target' });

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
        await api.create({ type: 'post', title: 'Target' });

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
