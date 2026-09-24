/**
 * Repository-level tests for the entries-table repository.
 *
 * These exercise the persistence contract directly (not through the
 * entries service): the `entries`/`entry_content` split, base CRUD, list
 * machinery, slug uniquification, and the trash/versions/staging/translatable
 * capability groups plus the preview token.
 */

import type { ContentRowId } from '@/content/repository/types';
import type { EntriesTableRepository } from '@/entries/repository/registry';
import { createTestDb, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { transaction } from '@/database/transaction';
import { ALL_CAPABILITIES } from '@/entries/capabilities';
import { getEntriesTableRepository } from '@/entries/repository/registry';

let repository: EntriesTableRepository;
let db: Awaited<ReturnType<typeof createTestDb>>;

beforeEach(async () => {
    db = await createTestDb();
    setupTestConfig();
    repository = getEntriesTableRepository();
});

describe('supports', () => {
    it('declares all capabilities', () => {
        expect(repository.supports).toEqual(ALL_CAPABILITIES);
    });
});

describe('base CRUD', () => {
    it('round-trips create/get/update/delete', async () => {
        const created = await repository.create({
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

        const got = await repository.findOne({ type: 'post', id: created.id });
        expect(got?.id).toBe(created.id);

        const updated = await repository.update({ id: created.id }, { title: 'Changed' });
        expect(updated.title).toBe('Changed');

        await repository.delete(created.id);
        expect(await repository.findOne({ type: 'post', id: created.id })).toBeNull();
    });

    it('writes an entries row and a content row, with distinct ids', async () => {
        const created = await repository.create({
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
        const created = await repository.create({ type: 'post', title: 'EN only' });
        expect(
            await repository.findOne({ type: 'post', id: created.id, locale: 'de' })
        ).toBeNull();
    });

    it('lists every locale that has a content row, sorted', async () => {
        const created = await repository.create({
            type: 'post',
            title: 'EN',
            slug: 'en',
        });
        await repository.update(
            { id: created.id, locale: 'de' },
            { title: 'DE', slug: 'de' }
        );

        const en = await repository.findOne({ type: 'post', id: created.id });
        const de = await repository.findOne({
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
        const e = await repository.create({ type: 'post', title: 'T', slug: 't' });
        await repository.trash.trash(e.id);
        expect(await repository.findOne({ type: 'post', id: e.id })).toBeNull();
        expect(
            await repository.findOne({ type: 'post', id: e.id }, { includeTrashed: true })
        ).not.toBeNull();
    });
});

describe('findOne and findAnyLocale address by type', () => {
    it('answer the row under its own type', async () => {
        const created = await repository.create({
            type: 'post',
            title: 'DE',
            slug: 'de',
            locale: 'de',
        });

        const got = await repository.findOne({
            type: 'post',
            id: created.id,
            locale: 'de',
        });
        expect(got?.id).toBe(created.id);
        expect(
            (await repository.findAnyLocale({ type: 'post', id: created.id }))?.id
        ).toBe(created.id);
    });

    it('answer null for an existing id asked for under another type', async () => {
        const created = await repository.create({
            type: 'post',
            title: 'DE',
            slug: 'de',
            locale: 'de',
        });

        expect(
            await repository.findOne({ type: 'note', id: created.id, locale: 'de' })
        ).toBeNull();
        expect(
            await repository.findAnyLocale({ type: 'note', id: created.id })
        ).toBeNull();
    });
});

describe('stored-row reads', () => {
    it('read entry and content rows by type, trashed and staged rows included', async () => {
        const post = await repository.create({ type: 'post', title: 'P', slug: 'p' });
        await repository.create({ type: 'note', title: 'N', slug: 'n' });
        await repository.staging.create({ id: post.id }, { title: 'Staged' });
        await repository.trash.trash(post.id);

        const posts = await repository.findEntryRowsByType('post');
        expect(posts.map((row) => row.id)).toEqual([post.id]);
        expect(await repository.findEntryRowsByType()).toHaveLength(2);

        const titles = (await repository.findContentRowsByType('post')).map(
            (row) => row.title
        );
        expect(titles.sort()).toEqual(['P', 'Staged']);
        expect(await repository.findContentRowsByType()).toHaveLength(3);
    });

    it('reads every content row of one entry', async () => {
        const e = await repository.create({ type: 'post', title: 'EN', slug: 'en' });
        await repository.update({ id: e.id, locale: 'de' }, { title: 'DE', slug: 'de' });
        await repository.create({ type: 'post', title: 'Other', slug: 'other' });

        const rows = await repository.findContentRowsByEntry(e.id);
        expect(rows.map((row) => row.locale).sort()).toEqual(['de', 'en']);
    });
});

describe('uniqueSlug', () => {
    it('returns the base slug when free, then -2 on collision', async () => {
        await repository.create({ type: 'post', title: 'A', slug: 'same' });
        expect(await repository.uniqueSlug('post', 'en', 'same')).toBe('same-2');
        expect(await repository.uniqueSlug('post', 'en', 'free')).toBe('free');
    });

    it('excludes the named entry, whichever locale holds the slug', async () => {
        const own = await repository.create({ type: 'post', title: 'A', slug: 'mine' });
        expect(await repository.uniqueSlug('post', 'en', 'mine', own.id)).toBe('mine');
    });
});

describe('existingIds', () => {
    it('reports live and trashed rows as existing, and nothing else', async () => {
        const live = await repository.create({ type: 'post', title: 'Live' });
        const trashed = await repository.create({ type: 'post', title: 'Trashed' });
        await repository.trash?.trash(trashed.id);

        expect(
            await repository.existingIds?.([live.id, trashed.id, 'no-such-id'])
        ).toEqual(new Set([live.id, trashed.id]));
    });
});

describe('findMany and count', () => {
    it('pages by limit and offset, and counts every match', async () => {
        for (let i = 0; i < 5; i++) {
            await repository.create({ type: 'post', title: `P${i}`, slug: `p${i}` });
        }
        const sort = { title: 'asc' } as const;
        const first = await repository.findMany({ type: 'post', sort, limit: 2 });
        expect(first.map((e) => e.title)).toEqual(['P0', 'P1']);
        const next = await repository.findMany({
            type: 'post',
            sort,
            limit: 2,
            offset: 2,
        });
        expect(next.map((e) => e.title)).toEqual(['P2', 'P3']);
        expect(await repository.findMany({ type: 'post' })).toHaveLength(5);
        expect(await repository.count({ type: 'post', limit: 2, offset: 2 })).toBe(5);
    });

    it('searches by title and sorts', async () => {
        await repository.create({ type: 'post', title: 'Bravo', slug: 'bravo' });
        await repository.create({ type: 'post', title: 'Alpha', slug: 'alpha' });

        const search = await repository.findMany({ type: 'post', search: 'Alpha' });
        expect(search.map((e) => e.title)).toEqual(['Alpha']);

        const sorted = await repository.findMany({
            type: 'post',
            sort: { title: 'asc' },
        });
        expect(sorted.map((e) => e.title)).toEqual(['Alpha', 'Bravo']);
    });

    it('searches by slug as well as title', async () => {
        // Title differs from the slug, so a slug match is the only way to find it.
        await repository.create({ type: 'post', title: 'Welcome', slug: 'home' });
        await repository.create({ type: 'post', title: 'Other', slug: 'other' });

        const bySlug = await repository.findMany({ type: 'post', search: 'home' });
        expect(bySlug.map((e) => e.title)).toEqual(['Welcome']);
    });

    it('reads a bare null in `where` as IS NULL, and undefined as unfiltered', async () => {
        // Same semantics as the shared `where` DSL (create-repository.ts): reading
        // null as "no filter" returned every row to a caller asking for the
        // null-slug ones.
        await repository.create({ type: 'card', title: '', slug: null });
        await repository.create({ type: 'card', title: 'Has slug', slug: 'has-slug' });

        const nullSlug = await repository.findMany({
            type: 'card',
            where: { slug: null },
        });
        expect(nullSlug.map((e) => e.slug)).toEqual([null]);

        const unfiltered = await repository.count({
            type: 'card',
            where: { slug: undefined },
        });
        expect(unfiltered).toBe(2);
    });

    it('filters by entry id', async () => {
        const a = await repository.create({ type: 'post', title: 'A', slug: 'a' });
        await repository.create({ type: 'post', title: 'B', slug: 'b' });

        const byId = await repository.findMany({
            type: 'post',
            where: { id: { in: [a.id] } },
        });
        expect(byId.map((e) => e.title)).toEqual(['A']);
    });

    it('keeps one locale per entry, or every locale under locale: all', async () => {
        const e = await repository.create({ type: 'post', title: 'EN', slug: 'en' });
        await repository.update({ id: e.id, locale: 'de' }, { title: 'DE', slug: 'de' });

        const oneLocale = await repository.findMany({ type: 'post' });
        expect(oneLocale.map((row) => row.title)).toEqual(['EN']);

        const everyLocale = await repository.findMany({
            type: 'post',
            locale: 'all',
            sort: { title: 'asc' },
        });
        expect(everyLocale.map((row) => row.title)).toEqual(['DE', 'EN']);
    });

    it('excludes trashed unless requested', async () => {
        const a = await repository.create({ type: 'post', title: 'A', slug: 'a' });
        await repository.create({ type: 'post', title: 'B', slug: 'b' });
        await repository.trash.trash(a.id);

        const live = await repository.findMany({ type: 'post' });
        expect(live.map((e) => e.title)).toEqual(['B']);

        const trashed = await repository.findMany({
            type: 'post',
            trashed: true,
        });
        expect(trashed.map((e) => e.title)).toEqual(['A']);
    });

    it('leaves rows published after publishedAsOf out of the rows and the count', async () => {
        const asOf = new Date();
        const published = { type: 'post', status: 'published' } as const;
        await repository.create({
            ...published,
            title: 'Past',
            slug: 'past',
            publishedAt: new Date(asOf.getTime() - 60_000),
        });
        await repository.create({
            ...published,
            title: 'At',
            slug: 'at',
            publishedAt: asOf,
        });
        await repository.create({ type: 'post', title: 'Unset', slug: 'unset' });
        await repository.create({
            ...published,
            title: 'Future',
            slug: 'future',
            publishedAt: new Date(asOf.getTime() + 60_000),
        });

        const params = { type: 'post', publishedAsOf: asOf } as const;
        const rows = await repository.findMany({ ...params, sort: { title: 'asc' } });
        expect(rows.map((e) => e.title)).toEqual(['At', 'Past', 'Unset']);
        expect(await repository.count(params)).toBe(3);
    });
});

describe('staging (forward versioning)', () => {
    it('stages a second content row for the same entry and locale', async () => {
        const canonical = await repository.create({
            type: 'post',
            title: 'Live',
            slug: 'live',
        });

        const staged = await repository.staging.create(
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

        const found = await repository.staging.findOne({ id: canonical.id });
        expect(found?.contentId).toBe(staged.contentId);
    });

    it('keeps the staged row out of lists, uniqueSlug and the locale list', async () => {
        const canonical = await repository.create({
            type: 'post',
            title: 'Live',
            slug: 'live',
        });
        await repository.staging.create(
            { id: canonical.id },
            { title: 'Staged change', slug: 'ghost' }
        );

        const list = await repository.findMany({ type: 'post' });
        expect(list.map((e) => e.title)).toEqual(['Live']);

        // A slug used ONLY by a staged row is still considered free.
        expect(await repository.uniqueSlug('post', 'en', 'ghost')).toBe('ghost');
        // The canonical still occupies its own slug.
        expect(await repository.uniqueSlug('post', 'en', 'live')).toBe('live-2');

        expect(
            (await repository.findOne({ type: 'post', id: canonical.id }))?.locales
        ).toEqual(['en']);
    });

    it('discards the staged row on delete', async () => {
        const canonical = await repository.create({
            type: 'post',
            title: 'Live',
            slug: 'live',
        });
        await repository.staging.create({ id: canonical.id }, { title: 'Staged' });

        await repository.staging.delete({ id: canonical.id });

        expect(await repository.staging.findOne({ id: canonical.id })).toBeNull();
        expect(
            await repository.findOne({ type: 'post', id: canonical.id })
        ).not.toBeNull();
    });
});

describe('trash sub-surface', () => {
    it('trash sets deletedAt, restore clears it, emptyTrash purges', async () => {
        const e = await repository.create({ type: 'post', title: 'T', slug: 't' });
        await repository.trash.trash(e.id);
        expect(
            (
                await repository.findOne(
                    { type: 'post', id: e.id },
                    { includeTrashed: true }
                )
            )?.deletedAt
        ).toBeInstanceOf(Date);

        const restored = await repository.trash.restore(e.id);
        expect(restored.deletedAt).toBeNull();

        await repository.trash.trash(e.id);
        await repository.trash.emptyTrash('post');
        expect(
            await repository.findOne({ type: 'post', id: e.id }, { includeTrashed: true })
        ).toBeNull();
    });

    it('hides every locale of a trashed entry', async () => {
        const e = await repository.create({ type: 'post', title: 'EN', slug: 'en' });
        await repository.update({ id: e.id, locale: 'de' }, { title: 'DE', slug: 'de' });

        await repository.trash.trash(e.id);

        expect(await repository.findOne({ type: 'post', id: e.id })).toBeNull();
        expect(
            await repository.findOne({ type: 'post', id: e.id, locale: 'de' })
        ).toBeNull();
        const trashedList = await repository.findMany({
            type: 'post',
            trashed: true,
            locale: 'all',
        });
        expect(trashedList).toHaveLength(2);
    });
});

describe('versions sub-surface', () => {
    it('creates, lists newest-first, gets, and tracks latestNumber', async () => {
        const e = await repository.create({ type: 'post', title: 'V', slug: 'v' });
        const contentId = e.contentId;
        expect(await repository.versions.latestNumber(contentId)).toBe(0);

        await repository.versions.create({
            contentId,
            version: 1,
            title: 'V1',
            slug: 'v',
            fields: { body: 'one' },
            createdBy: null,
        });
        await repository.versions.create({
            contentId,
            version: 2,
            title: 'V2',
            slug: 'v',
            fields: { body: 'two' },
            createdBy: null,
        });

        expect(await repository.versions.latestNumber(contentId)).toBe(2);
        const list = await repository.versions.findMany(contentId);
        expect(list.map((v) => v.version)).toEqual([2, 1]);

        const one = list.find((v) => v.version === 1);
        if (!one) throw new Error('expected version 1');
        const got = await repository.versions.findOne(one.id);
        expect(got?.title).toBe('V1');
    });

    it('keeps a separate sequence per locale', async () => {
        const e = await repository.create({ type: 'post', title: 'EN', slug: 'en' });
        const de = await repository.update(
            { id: e.id, locale: 'de' },
            { title: 'DE', slug: 'de' }
        );

        await repository.versions.create({
            contentId: e.contentId,
            version: 1,
            title: 'EN v1',
            slug: 'en',
            fields: {},
            createdBy: null,
        });

        expect(await repository.versions.latestNumber(e.contentId)).toBe(1);
        expect(await repository.versions.latestNumber(de.contentId)).toBe(0);
        expect(await repository.versions.findMany(de.contentId)).toEqual([]);
    });
});

describe('translatable sub-surface', () => {
    it('returns siblings excluding the given locale and propagates field values', async () => {
        const en = await repository.create({
            type: 'post',
            title: 'EN',
            slug: 'en',
            locale: 'en',
            fields: { body: 'enbody', category: 'news' },
        });
        await repository.update(
            { id: en.id, locale: 'de' },
            {
                title: 'DE',
                slug: 'de',
                fields: { body: 'debody', category: 'news' },
            }
        );

        const siblings = await repository.translatable.siblings(en.id, 'en');
        expect(siblings.map((s) => s.locale)).toEqual(['de']);

        await repository.translatable.propagateFields(en.id, 'en', {
            category: 'updated',
        });
        const deAfter = await repository.findOne({
            type: 'post',
            id: en.id,
            locale: 'de',
        });
        expect(deAfter?.fields).toEqual({ body: 'debody', category: 'updated' });
        // The excluded locale is untouched.
        const enAfter = await repository.findOne({ type: 'post', id: en.id });
        expect(enAfter?.fields).toEqual({ body: 'enbody', category: 'news' });
    });
});

describe('previewToken', () => {
    it('stores a hash, finds the entry by it, and clears it', async () => {
        const e = await repository.create({ type: 'post', title: 'P', slug: 'p' });
        const expiresAt = new Date(Date.now() + 60_000);

        await repository.previewToken.set(e.id, 'hash-abc', expiresAt);
        const found = await repository.previewToken.findByHash('hash-abc');
        expect(found?.id).toBe(e.id);
        expect(found?.expiresAt).toEqual(expiresAt);

        await repository.previewToken.clear(e.id);
        expect(await repository.previewToken.findByHash('hash-abc')).toBeNull();
    });

    it('returns null for an unknown hash', async () => {
        expect(await repository.previewToken.findByHash('nope')).toBeNull();
    });
});

describe('transaction', () => {
    // `EntryRepository` carries no `transaction` of its own; the repository
    // joins whatever scope `database/transaction.ts`'s `transaction()` opens,
    // since every operation resolves its handle per call through `getDb()`.

    it('rolls back atomically when the callback throws', async () => {
        const e = await repository.create({ type: 'post', title: 'Keep', slug: 'keep' });
        await expect(
            transaction(async () => {
                await repository.update({ id: e.id }, { title: 'Changed' });
                throw new Error('boom');
            })
        ).rejects.toThrow('boom');

        const after = await repository.findOne({ type: 'post', id: e.id });
        expect(after?.title).toBe('Keep');
    });

    it('rolls back both rows of a failed create', async () => {
        await expect(
            transaction(async () => {
                await repository.create({ type: 'post', title: 'Gone', slug: 'gone' });
                throw new Error('boom');
            })
        ).rejects.toThrow('boom');

        expect(await repository.findMany({ type: 'post' })).toEqual([]);
        expect(await db.selectFrom('entryContent').selectAll().execute()).toEqual([]);
    });

    it('commits writes made inside the callback', async () => {
        const e = await repository.create({ type: 'post', title: 'Before', slug: 'b' });
        const result = await transaction(async () =>
            repository.update({ id: e.id }, { title: 'After' })
        );
        expect(result.title).toBe('After');

        const after = await repository.findOne({ type: 'post', id: e.id });
        expect(after?.title).toBe('After');
    });

    // Nesting joins the outer transaction (`DECISIONS.md`): a `transaction()`
    // call while a scope is open runs its body on the same handle, so the inner
    // write is part of the outer commit.
    it('joins an already-open scope rather than opening a nested transaction', async () => {
        const created = await transaction(async () => {
            const outer = await repository.create({
                type: 'post',
                title: 'Outer',
                slug: 'outer',
            });
            await transaction(async () => {
                await repository.update({ id: outer.id }, { title: 'Inner' });
            });
            return outer;
        });

        const after = await repository.findOne({ type: 'post', id: created.id });
        expect(after?.title).toBe('Inner');
    });
});

describe('unique (entryId, locale)', () => {
    it('refuses a second canonical row for the same locale', async () => {
        const e = await repository.create({ type: 'post', title: 'EN', slug: 'en' });
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
