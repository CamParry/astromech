/**
 * Repository-level tests for the entry entryRepository.
 *
 * These exercise the persistence contract directly (not through the
 * entries service): the `entries`/`entry_content` split, base CRUD, list
 * machinery, slug uniquification, and the trash/versions/staging/translatable
 * capability groups plus the preview token.
 */

import type { ContentRowId } from '@/content/repository/types';
import { createTestDb, setupTestConfig } from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { transaction } from '@/database/transaction';
import { entryRepository } from '@/entries/repository/entries-table';

let db: Awaited<ReturnType<typeof createTestDb>>;

beforeEach(async () => {
    db = await createTestDb();
    setupTestConfig();
});

describe('base CRUD', () => {
    it('round-trips create/get/update/delete', async () => {
        const created = await entryRepository.create({
            type: 'post',
            title: 'Hello',
            slug: 'hello',
            fields: { body: 'hi' },
        });
        expect(created.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/); // ULID
        expect(created.title).toBe('Hello');
        expect(created.status).toBe('unpublished');
        expect(created.fields).toEqual({ body: 'hi' });
        expect(created.locale).toBe('en');
        expect(created.locales).toEqual(['en']);
        expect(created.staged).toBe(false);

        const got = await entryRepository.findOne({ type: 'post', id: created.id });
        expect(got?.id).toBe(created.id);

        const updated = await entryRepository.update(
            { id: created.id },
            { title: 'Changed' }
        );
        expect(updated.title).toBe('Changed');

        await entryRepository.delete(created.id);
        expect(
            await entryRepository.findOne({ type: 'post', id: created.id })
        ).toBeNull();
    });

    it('writes an entries row and a content row, with distinct ids', async () => {
        const created = await entryRepository.create({
            type: 'post',
            title: 'Split',
            slug: 'split',
        });

        const entry = await db
            .selectFrom('entries')
            .selectAll()
            .where('id', '=', created.id)
            .executeTakeFirst();
        expect(entry?.type).toBe('post');

        const content = await db
            .selectFrom('entryContent')
            .selectAll()
            .where('entryId', '=', created.id)
            .execute();
        expect(content).toHaveLength(1);
        expect(content[0]?.locale).toBe('en');
        expect(content[0]?.title).toBe('Split');
        // The public id is the entry id; the content row carries its own.
        expect(created.contentId).toBe(content[0]?.id);
        expect(created.contentId).not.toBe(created.id);
    });

    it('returns null for a locale with no content row', async () => {
        const created = await entryRepository.create({ type: 'post', title: 'EN only' });
        expect(
            await entryRepository.findOne({ type: 'post', id: created.id, locale: 'de' })
        ).toBeNull();
    });

    it('lists every locale that has a content row, sorted', async () => {
        const created = await entryRepository.create({
            type: 'post',
            title: 'EN',
            slug: 'en',
        });
        await entryRepository.update(
            { id: created.id, locale: 'de' },
            { title: 'DE', slug: 'de' }
        );

        const en = await entryRepository.findOne({ type: 'post', id: created.id });
        const de = await entryRepository.findOne({
            type: 'post',
            id: created.id,
            locale: 'de',
        });
        expect(en?.locales).toEqual(['de', 'en']);
        expect(de?.locales).toEqual(['de', 'en']);
        // One entry, one id, whichever locale is read.
        expect(de?.id).toBe(created.id);
    });

    it('findOne filters trashed rows unless includeTrashed is set', async () => {
        const e = await entryRepository.create({ type: 'post', title: 'T', slug: 't' });
        await entryRepository.trash.trash(e.id);
        expect(await entryRepository.findOne({ type: 'post', id: e.id })).toBeNull();
        expect(
            await entryRepository.findOne(
                { type: 'post', id: e.id },
                { includeTrashed: true }
            )
        ).not.toBeNull();
    });
});

describe('findOne and findAnyLocale address by type', () => {
    it('answer the row under its own type', async () => {
        const created = await entryRepository.create({
            type: 'post',
            title: 'DE',
            slug: 'de',
            locale: 'de',
        });

        const got = await entryRepository.findOne({
            type: 'post',
            id: created.id,
            locale: 'de',
        });
        expect(got?.id).toBe(created.id);
        expect(
            (await entryRepository.findAnyLocale({ type: 'post', id: created.id }))?.id
        ).toBe(created.id);
    });

    it('answer null for an existing id asked for under another type', async () => {
        const created = await entryRepository.create({
            type: 'post',
            title: 'DE',
            slug: 'de',
            locale: 'de',
        });

        expect(
            await entryRepository.findOne({ type: 'note', id: created.id, locale: 'de' })
        ).toBeNull();
        expect(
            await entryRepository.findAnyLocale({ type: 'note', id: created.id })
        ).toBeNull();
    });
});

describe('stored-row reads', () => {
    it('read entry and content rows by type, trashed and staged rows included', async () => {
        const post = await entryRepository.create({
            type: 'post',
            title: 'P',
            slug: 'p',
        });
        await entryRepository.create({ type: 'note', title: 'N', slug: 'n' });
        await entryRepository.staging.create({ id: post.id }, { title: 'Staged' });
        await entryRepository.trash.trash(post.id);

        const posts = await entryRepository.findEntryRowsByType('post');
        expect(posts.map((row) => row.id)).toEqual([post.id]);
        expect(await entryRepository.findEntryRowsByType()).toHaveLength(2);

        const titles = (await entryRepository.findContentRowsByType('post')).map(
            (row) => row.title
        );
        expect(titles.sort()).toEqual(['P', 'Staged']);
        expect(await entryRepository.findContentRowsByType()).toHaveLength(3);
    });

    it('reads every content row of one entry', async () => {
        const e = await entryRepository.create({ type: 'post', title: 'EN', slug: 'en' });
        await entryRepository.update(
            { id: e.id, locale: 'de' },
            { title: 'DE', slug: 'de' }
        );
        await entryRepository.create({ type: 'post', title: 'Other', slug: 'other' });

        const rows = await entryRepository.findContentRowsByEntry(e.id);
        expect(rows.map((row) => row.locale).sort()).toEqual(['de', 'en']);
    });
});

describe('uniqueSlug', () => {
    it('returns the base slug when free, then -2 on collision', async () => {
        await entryRepository.create({ type: 'post', title: 'A', slug: 'same' });
        expect(await entryRepository.uniqueSlug('post', 'en', 'same')).toBe('same-2');
        expect(await entryRepository.uniqueSlug('post', 'en', 'free')).toBe('free');
    });

    it('excludes the named entry, whichever locale holds the slug', async () => {
        const own = await entryRepository.create({
            type: 'post',
            title: 'A',
            slug: 'mine',
        });
        expect(await entryRepository.uniqueSlug('post', 'en', 'mine', own.id)).toBe(
            'mine'
        );
    });
});

describe('findMany and count', () => {
    it('pages by limit and offset, and counts every match', async () => {
        for (let i = 0; i < 5; i++) {
            await entryRepository.create({ type: 'post', title: `P${i}`, slug: `p${i}` });
        }
        const sort = { title: 'asc' } as const;
        const first = await entryRepository.findMany({ type: 'post', sort, limit: 2 });
        expect(first.map((e) => e.title)).toEqual(['P0', 'P1']);
        const next = await entryRepository.findMany({
            type: 'post',
            sort,
            limit: 2,
            offset: 2,
        });
        expect(next.map((e) => e.title)).toEqual(['P2', 'P3']);
        expect(await entryRepository.findMany({ type: 'post' })).toHaveLength(5);
        expect(await entryRepository.count({ type: 'post', limit: 2, offset: 2 })).toBe(
            5
        );
    });

    it('searches by title and sorts', async () => {
        await entryRepository.create({ type: 'post', title: 'Bravo', slug: 'bravo' });
        await entryRepository.create({ type: 'post', title: 'Alpha', slug: 'alpha' });

        const search = await entryRepository.findMany({ type: 'post', search: 'Alpha' });
        expect(search.map((e) => e.title)).toEqual(['Alpha']);

        const sorted = await entryRepository.findMany({
            type: 'post',
            sort: { title: 'asc' },
        });
        expect(sorted.map((e) => e.title)).toEqual(['Alpha', 'Bravo']);
    });

    describe('sorted by updatedAt', () => {
        afterEach(() => {
            vi.useRealTimers();
        });

        it('follows the entry row, which a write to any locale moves', async () => {
            vi.useFakeTimers({ toFake: ['Date'] });
            vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
            const first = await entryRepository.create({
                type: 'post',
                title: 'First',
                slug: 'first',
            });
            vi.setSystemTime(new Date('2026-01-02T00:00:00.000Z'));
            await entryRepository.create({
                type: 'post',
                title: 'Second',
                slug: 'second',
            });
            // Only the `de` row is written, so `first`'s `en` row keeps its
            // older content timestamp while the entry row moves past `second`.
            vi.setSystemTime(new Date('2026-01-03T00:00:00.000Z'));
            await entryRepository.update(
                { id: first.id, locale: 'de' },
                { title: 'Erste', slug: 'erste' }
            );

            const sorted = await entryRepository.findMany({
                type: 'post',
                locale: 'en',
                sort: { updatedAt: 'desc' },
            });
            expect(sorted.map((e) => e.title)).toEqual(['First', 'Second']);
        });
    });

    it('searches by slug as well as title', async () => {
        // Title differs from the slug, so a slug match is the only way to find it.
        await entryRepository.create({ type: 'post', title: 'Welcome', slug: 'home' });
        await entryRepository.create({ type: 'post', title: 'Other', slug: 'other' });

        const bySlug = await entryRepository.findMany({ type: 'post', search: 'home' });
        expect(bySlug.map((e) => e.title)).toEqual(['Welcome']);
    });

    it('reads a bare null in `where` as IS NULL, and undefined as unfiltered', async () => {
        // Same semantics as the shared `where` DSL (create-entryRepository.ts): reading
        // null as "no filter" returned every row to a caller asking for the
        // null-slug ones.
        await entryRepository.create({ type: 'card', title: '', slug: null });
        await entryRepository.create({
            type: 'card',
            title: 'Has slug',
            slug: 'has-slug',
        });

        const nullSlug = await entryRepository.findMany({
            type: 'card',
            where: { slug: null },
        });
        expect(nullSlug.map((e) => e.slug)).toEqual([null]);

        const unfiltered = await entryRepository.count({
            type: 'card',
            where: { slug: undefined },
        });
        expect(unfiltered).toBe(2);
    });

    it('filters by entry id', async () => {
        const a = await entryRepository.create({ type: 'post', title: 'A', slug: 'a' });
        await entryRepository.create({ type: 'post', title: 'B', slug: 'b' });

        const byId = await entryRepository.findMany({
            type: 'post',
            where: { id: { in: [a.id] } },
        });
        expect(byId.map((e) => e.title)).toEqual(['A']);
    });

    it('keeps one locale per entry, or every locale under locale: all', async () => {
        const e = await entryRepository.create({ type: 'post', title: 'EN', slug: 'en' });
        await entryRepository.update(
            { id: e.id, locale: 'de' },
            { title: 'DE', slug: 'de' }
        );

        const oneLocale = await entryRepository.findMany({ type: 'post' });
        expect(oneLocale.map((row) => row.title)).toEqual(['EN']);

        const everyLocale = await entryRepository.findMany({
            type: 'post',
            locale: 'all',
            sort: { title: 'asc' },
        });
        expect(everyLocale.map((row) => row.title)).toEqual(['DE', 'EN']);
    });

    it('excludes trashed unless requested', async () => {
        const a = await entryRepository.create({ type: 'post', title: 'A', slug: 'a' });
        await entryRepository.create({ type: 'post', title: 'B', slug: 'b' });
        await entryRepository.trash.trash(a.id);

        const live = await entryRepository.findMany({ type: 'post' });
        expect(live.map((e) => e.title)).toEqual(['B']);

        const trashed = await entryRepository.findMany({
            type: 'post',
            trashed: true,
        });
        expect(trashed.map((e) => e.title)).toEqual(['A']);
    });

    it('leaves rows published after publishedAsOf out of the rows and the count', async () => {
        const asOf = new Date();
        const published = { type: 'post', status: 'published' } as const;
        await entryRepository.create({
            ...published,
            title: 'Past',
            slug: 'past',
            publishedAt: new Date(asOf.getTime() - 60_000),
        });
        await entryRepository.create({
            ...published,
            title: 'At',
            slug: 'at',
            publishedAt: asOf,
        });
        await entryRepository.create({ type: 'post', title: 'Unset', slug: 'unset' });
        await entryRepository.create({
            ...published,
            title: 'Future',
            slug: 'future',
            publishedAt: new Date(asOf.getTime() + 60_000),
        });

        const params = { type: 'post', publishedAsOf: asOf } as const;
        const rows = await entryRepository.findMany({
            ...params,
            sort: { title: 'asc' },
        });
        expect(rows.map((e) => e.title)).toEqual(['At', 'Past', 'Unset']);
        expect(await entryRepository.count(params)).toBe(3);
    });
});

describe('staging (forward versioning)', () => {
    it('stages a second content row for the same entry and locale', async () => {
        const canonical = await entryRepository.create({
            type: 'post',
            title: 'Live',
            slug: 'live',
        });

        const staged = await entryRepository.staging.create(
            { id: canonical.id },
            { title: 'Staged change', slug: 'live', fields: { body: 'draft' } }
        );

        // Same entry, same locale — a second row inside the partial unique index.
        expect(staged.id).toBe(canonical.id);
        expect(staged.locale).toBe('en');
        expect(staged.staged).toBe(true);
        expect(staged.contentId).not.toBe(canonical.contentId);

        const rows = await db
            .selectFrom('entryContent')
            .select(['id', 'stagedFor'])
            .where('entryId', '=', canonical.id)
            .execute();
        expect(rows).toHaveLength(2);
        expect(rows.find((row) => row.stagedFor !== null)?.stagedFor).toBe(
            canonical.contentId
        );

        const found = await entryRepository.staging.findOne({ id: canonical.id });
        expect(found?.contentId).toBe(staged.contentId);
    });

    it('keeps the staged row out of lists, uniqueSlug and the locale list', async () => {
        const canonical = await entryRepository.create({
            type: 'post',
            title: 'Live',
            slug: 'live',
        });
        await entryRepository.staging.create(
            { id: canonical.id },
            { title: 'Staged change', slug: 'ghost' }
        );

        const list = await entryRepository.findMany({ type: 'post' });
        expect(list.map((e) => e.title)).toEqual(['Live']);

        // A slug used ONLY by a staged row is still considered free.
        expect(await entryRepository.uniqueSlug('post', 'en', 'ghost')).toBe('ghost');
        // The canonical still occupies its own slug.
        expect(await entryRepository.uniqueSlug('post', 'en', 'live')).toBe('live-2');

        expect(
            (await entryRepository.findOne({ type: 'post', id: canonical.id }))?.locales
        ).toEqual(['en']);
    });

    it('discards the staged row on delete', async () => {
        const canonical = await entryRepository.create({
            type: 'post',
            title: 'Live',
            slug: 'live',
        });
        await entryRepository.staging.create({ id: canonical.id }, { title: 'Staged' });

        await entryRepository.staging.delete({ id: canonical.id });

        expect(await entryRepository.staging.findOne({ id: canonical.id })).toBeNull();
        expect(
            await entryRepository.findOne({ type: 'post', id: canonical.id })
        ).not.toBeNull();
    });
});

describe('trash sub-surface', () => {
    it('trash sets deletedAt, restore clears it, emptyTrash purges', async () => {
        const e = await entryRepository.create({ type: 'post', title: 'T', slug: 't' });
        await entryRepository.trash.trash(e.id);
        expect(
            (
                await entryRepository.findOne(
                    { type: 'post', id: e.id },
                    { includeTrashed: true }
                )
            )?.deletedAt
        ).toBeInstanceOf(Date);

        const restored = await entryRepository.trash.restore(e.id);
        expect(restored.deletedAt).toBeNull();

        await entryRepository.trash.trash(e.id);
        await entryRepository.trash.emptyTrash('post');
        expect(
            await entryRepository.findOne(
                { type: 'post', id: e.id },
                { includeTrashed: true }
            )
        ).toBeNull();
    });

    it('hides every locale of a trashed entry', async () => {
        const e = await entryRepository.create({ type: 'post', title: 'EN', slug: 'en' });
        await entryRepository.update(
            { id: e.id, locale: 'de' },
            { title: 'DE', slug: 'de' }
        );

        await entryRepository.trash.trash(e.id);

        expect(await entryRepository.findOne({ type: 'post', id: e.id })).toBeNull();
        expect(
            await entryRepository.findOne({ type: 'post', id: e.id, locale: 'de' })
        ).toBeNull();
        const trashedList = await entryRepository.findMany({
            type: 'post',
            trashed: true,
            locale: 'all',
        });
        expect(trashedList).toHaveLength(2);
    });
});

describe('versions sub-surface', () => {
    it('creates, lists newest-first, gets, and tracks latestNumber', async () => {
        const e = await entryRepository.create({ type: 'post', title: 'V', slug: 'v' });
        const contentId = e.contentId;
        expect(await entryRepository.versions.latestNumber(contentId)).toBe(0);

        await entryRepository.versions.create({
            contentId,
            version: 1,
            title: 'V1',
            slug: 'v',
            fields: { body: 'one' },
            createdBy: null,
        });
        await entryRepository.versions.create({
            contentId,
            version: 2,
            title: 'V2',
            slug: 'v',
            fields: { body: 'two' },
            createdBy: null,
        });

        expect(await entryRepository.versions.latestNumber(contentId)).toBe(2);
        const list = await entryRepository.versions.findMany(contentId);
        expect(list.map((v) => v.version)).toEqual([2, 1]);

        const one = list.find((v) => v.version === 1);
        if (!one) throw new Error('expected version 1');
        const got = await entryRepository.versions.findOne(one.id);
        expect(got?.title).toBe('V1');
    });

    it('keeps a separate sequence per locale', async () => {
        const e = await entryRepository.create({ type: 'post', title: 'EN', slug: 'en' });
        const de = await entryRepository.update(
            { id: e.id, locale: 'de' },
            { title: 'DE', slug: 'de' }
        );

        await entryRepository.versions.create({
            contentId: e.contentId,
            version: 1,
            title: 'EN v1',
            slug: 'en',
            fields: {},
            createdBy: null,
        });

        expect(await entryRepository.versions.latestNumber(e.contentId)).toBe(1);
        expect(await entryRepository.versions.latestNumber(de.contentId)).toBe(0);
        expect(await entryRepository.versions.findMany(de.contentId)).toEqual([]);
    });
});

describe('translatable sub-surface', () => {
    it('returns siblings excluding the given locale and propagates field values', async () => {
        const en = await entryRepository.create({
            type: 'post',
            title: 'EN',
            slug: 'en',
            locale: 'en',
            fields: { body: 'enbody', category: 'news' },
        });
        await entryRepository.update(
            { id: en.id, locale: 'de' },
            {
                title: 'DE',
                slug: 'de',
                fields: { body: 'debody', category: 'news' },
            }
        );

        const siblings = await entryRepository.translatable.siblings(en.id, 'en');
        expect(siblings.map((s) => s.locale)).toEqual(['de']);

        await entryRepository.translatable.propagateFields(en.id, 'en', {
            category: 'updated',
        });
        const deAfter = await entryRepository.findOne({
            type: 'post',
            id: en.id,
            locale: 'de',
        });
        expect(deAfter?.fields).toEqual({ body: 'debody', category: 'updated' });
        // The excluded locale is untouched.
        const enAfter = await entryRepository.findOne({ type: 'post', id: en.id });
        expect(enAfter?.fields).toEqual({ body: 'enbody', category: 'news' });
    });
});

describe('previewToken', () => {
    it('stores a hash, finds the entry by it, and clears it', async () => {
        const e = await entryRepository.create({ type: 'post', title: 'P', slug: 'p' });
        const expiresAt = new Date(Date.now() + 60_000);

        await entryRepository.previewToken.set(e.id, 'hash-abc', expiresAt);
        const found = await entryRepository.previewToken.findByHash('hash-abc');
        expect(found?.id).toBe(e.id);
        expect(found?.expiresAt).toEqual(expiresAt);

        await entryRepository.previewToken.clear(e.id);
        expect(await entryRepository.previewToken.findByHash('hash-abc')).toBeNull();
    });

    it('returns null for an unknown hash', async () => {
        expect(await entryRepository.previewToken.findByHash('nope')).toBeNull();
    });

    it('leaves the entry row updatedAt alone', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        try {
            vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
            const e = await entryRepository.create({
                type: 'post',
                title: 'P',
                slug: 'p',
            });
            vi.setSystemTime(new Date('2026-01-02T00:00:00.000Z'));

            await entryRepository.previewToken.set(e.id, 'hash-abc', null);
            await entryRepository.previewToken.clear(e.id);

            const [row] = await entryRepository.findEntryRowsByType('post');
            expect(row?.updatedAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
        } finally {
            vi.useRealTimers();
        }
    });
});

describe('transaction', () => {
    // The repository carries no `transaction` of its own; it joins whatever
    // scope `database/transaction.ts`'s `transaction()` opens, since every
    // operation resolves its handle per call through `getDb()`.

    it('rolls back atomically when the callback throws', async () => {
        const e = await entryRepository.create({
            type: 'post',
            title: 'Keep',
            slug: 'keep',
        });
        await expect(
            transaction(async () => {
                await entryRepository.update({ id: e.id }, { title: 'Changed' });
                throw new Error('boom');
            })
        ).rejects.toThrow('boom');

        const after = await entryRepository.findOne({ type: 'post', id: e.id });
        expect(after?.title).toBe('Keep');
    });

    it('rolls back both rows of a failed create', async () => {
        await expect(
            transaction(async () => {
                await entryRepository.create({
                    type: 'post',
                    title: 'Gone',
                    slug: 'gone',
                });
                throw new Error('boom');
            })
        ).rejects.toThrow('boom');

        expect(await entryRepository.findMany({ type: 'post' })).toEqual([]);
        expect(await db.selectFrom('entryContent').selectAll().execute()).toEqual([]);
    });

    it('commits writes made inside the callback', async () => {
        const e = await entryRepository.create({
            type: 'post',
            title: 'Before',
            slug: 'b',
        });
        const result = await transaction(async () =>
            entryRepository.update({ id: e.id }, { title: 'After' })
        );
        expect(result.title).toBe('After');

        const after = await entryRepository.findOne({ type: 'post', id: e.id });
        expect(after?.title).toBe('After');
    });

    // Nesting joins the outer transaction (`DECISIONS.md`): a `transaction()`
    // call while a scope is open runs its body on the same handle, so the inner
    // write is part of the outer commit.
    it('joins an already-open scope rather than opening a nested transaction', async () => {
        const created = await transaction(async () => {
            const outer = await entryRepository.create({
                type: 'post',
                title: 'Outer',
                slug: 'outer',
            });
            await transaction(async () => {
                await entryRepository.update({ id: outer.id }, { title: 'Inner' });
            });
            return outer;
        });

        const after = await entryRepository.findOne({ type: 'post', id: created.id });
        expect(after?.title).toBe('Inner');
    });
});

describe('unique (entryId, locale)', () => {
    it('refuses a second canonical row for the same locale', async () => {
        const e = await entryRepository.create({ type: 'post', title: 'EN', slug: 'en' });
        await expect(
            db
                .insertInto('entryContent')
                .values({
                    id: 'duplicate-content-row' as ContentRowId,
                    entryId: e.id,
                    type: 'post',
                    locale: 'en',
                    title: 'Second EN',
                    slug: 'en-2',
                    status: 'unpublished',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                })
                .execute()
        ).rejects.toThrow();
    });
});
