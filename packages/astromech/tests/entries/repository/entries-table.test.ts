/**
 * Repository-level tests for the entries-table repository.
 *
 * These exercise the persistence contract directly (not through the
 * entries service): the `entries`/`entry_content` split, base CRUD, list
 * machinery, slug uniquification, and the trash/versions/staging/translatable
 * capability groups plus the preview token.
 */

import type { ContentRowId } from '@/entries/repository/types';
import { createTestDb, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { transaction } from '@/database/transaction';
import { ALL_CAPABILITIES } from '@/entries/capabilities';
import { createEntriesTableRepository } from '@/entries/repository/entries-table';

let repository: ReturnType<typeof createEntriesTableRepository>;
let db: Awaited<ReturnType<typeof createTestDb>>;

beforeEach(async () => {
    db = await createTestDb();
    setupTestConfig();
    repository = createEntriesTableRepository();
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

        const got = await repository.get({ id: created.id });
        expect(got?.id).toBe(created.id);

        const updated = await repository.update({ id: created.id }, { title: 'Changed' });
        expect(updated.title).toBe('Changed');

        await repository.delete(created.id);
        expect(await repository.get({ id: created.id })).toBeNull();
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
        expect(await repository.get({ id: created.id, locale: 'de' })).toBeNull();
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

        const en = await repository.get({ id: created.id });
        const de = await repository.get({ id: created.id, locale: 'de' });
        expect(en?.locales).toEqual(['de', 'en']);
        expect(de?.locales).toEqual(['de', 'en']);
        // One entry, one id, whichever locale is read.
        expect(de?.id).toBe(created.id);
    });

    it('get filters trashed rows unless includeTrashed is set', async () => {
        const e = await repository.create({ type: 'post', title: 'T', slug: 't' });
        await repository.trash.trash(e.id);
        expect(await repository.get({ id: e.id })).toBeNull();
        expect(
            await repository.get({ id: e.id }, { includeTrashed: true })
        ).not.toBeNull();
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

describe('list', () => {
    it('paginates with total', async () => {
        for (let i = 0; i < 5; i++) {
            await repository.create({ type: 'post', title: `P${i}`, slug: `p${i}` });
        }
        const res = await repository.list({ type: 'post', limit: 2, page: 1 });
        expect(res.data).toHaveLength(2);
        expect(res.total).toBe(5);
    });

    it('searches by title and sorts', async () => {
        await repository.create({ type: 'post', title: 'Bravo', slug: 'bravo' });
        await repository.create({ type: 'post', title: 'Alpha', slug: 'alpha' });

        const search = await repository.list({ type: 'post', search: 'Alpha' });
        expect(search.data.map((e) => e.title)).toEqual(['Alpha']);

        const sorted = await repository.list({ type: 'post', sort: { title: 'asc' } });
        expect(sorted.data.map((e) => e.title)).toEqual(['Alpha', 'Bravo']);
    });

    it('searches by slug as well as title', async () => {
        // Title differs from the slug, so a slug match is the only way to find it.
        await repository.create({ type: 'post', title: 'Welcome', slug: 'home' });
        await repository.create({ type: 'post', title: 'Other', slug: 'other' });

        const bySlug = await repository.list({ type: 'post', search: 'home' });
        expect(bySlug.data.map((e) => e.title)).toEqual(['Welcome']);
    });

    it('reads a bare null in `where` as IS NULL, and undefined as unfiltered', async () => {
        // Same semantics as the shared `where` DSL (create-repository.ts): reading
        // null as "no filter" returned every row to a caller asking for the
        // null-slug ones.
        await repository.create({ type: 'card', title: '', slug: null });
        await repository.create({ type: 'card', title: 'Has slug', slug: 'has-slug' });

        const nullSlug = await repository.list({
            type: 'card',
            where: { slug: null },
            limit: 'all',
        });
        expect(nullSlug.data.map((e) => e.slug)).toEqual([null]);

        const unfiltered = await repository.list({
            type: 'card',
            where: { slug: undefined },
            limit: 'all',
        });
        expect(unfiltered.total).toBe(2);
    });

    it('filters by entry id', async () => {
        const a = await repository.create({ type: 'post', title: 'A', slug: 'a' });
        await repository.create({ type: 'post', title: 'B', slug: 'b' });

        const byId = await repository.list({
            type: 'post',
            where: { id: { in: [a.id] } },
            limit: 'all',
        });
        expect(byId.data.map((e) => e.title)).toEqual(['A']);
    });

    it('keeps one locale per entry, or every locale under locale: all', async () => {
        const e = await repository.create({ type: 'post', title: 'EN', slug: 'en' });
        await repository.update({ id: e.id, locale: 'de' }, { title: 'DE', slug: 'de' });

        const oneLocale = await repository.list({ type: 'post', limit: 'all' });
        expect(oneLocale.data.map((row) => row.title)).toEqual(['EN']);

        const everyLocale = await repository.list({
            type: 'post',
            locale: 'all',
            limit: 'all',
            sort: { title: 'asc' },
        });
        expect(everyLocale.data.map((row) => row.title)).toEqual(['DE', 'EN']);
    });

    it('excludes trashed unless requested', async () => {
        const a = await repository.create({ type: 'post', title: 'A', slug: 'a' });
        await repository.create({ type: 'post', title: 'B', slug: 'b' });
        await repository.trash.trash(a.id);

        const live = await repository.list({ type: 'post', limit: 'all' });
        expect(live.data.map((e) => e.title)).toEqual(['B']);

        const trashed = await repository.list({
            type: 'post',
            trashed: true,
            limit: 'all',
        });
        expect(trashed.data.map((e) => e.title)).toEqual(['A']);
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

        const found = await repository.staging.getByCanonical(canonical.id);
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

        const list = await repository.list({ type: 'post', limit: 'all' });
        expect(list.data.map((e) => e.title)).toEqual(['Live']);

        // A slug used ONLY by a staged row is still considered free.
        expect(await repository.uniqueSlug('post', 'en', 'ghost')).toBe('ghost');
        // The canonical still occupies its own slug.
        expect(await repository.uniqueSlug('post', 'en', 'live')).toBe('live-2');

        expect((await repository.get({ id: canonical.id }))?.locales).toEqual(['en']);
    });

    it('discards the staged row on delete', async () => {
        const canonical = await repository.create({
            type: 'post',
            title: 'Live',
            slug: 'live',
        });
        await repository.staging.create({ id: canonical.id }, { title: 'Staged' });

        await repository.staging.delete({ id: canonical.id });

        expect(await repository.staging.getByCanonical(canonical.id)).toBeNull();
        expect(await repository.get({ id: canonical.id })).not.toBeNull();
    });
});

describe('trash sub-surface', () => {
    it('trash sets deletedAt, restore clears it, emptyTrash purges', async () => {
        const e = await repository.create({ type: 'post', title: 'T', slug: 't' });
        await repository.trash.trash(e.id);
        expect(
            (await repository.get({ id: e.id }, { includeTrashed: true }))?.deletedAt
        ).toBeInstanceOf(Date);

        const restored = await repository.trash.restore(e.id);
        expect(restored.deletedAt).toBeNull();

        await repository.trash.trash(e.id);
        await repository.trash.emptyTrash('post');
        expect(await repository.get({ id: e.id }, { includeTrashed: true })).toBeNull();
    });

    it('hides every locale of a trashed entry', async () => {
        const e = await repository.create({ type: 'post', title: 'EN', slug: 'en' });
        await repository.update({ id: e.id, locale: 'de' }, { title: 'DE', slug: 'de' });

        await repository.trash.trash(e.id);

        expect(await repository.get({ id: e.id })).toBeNull();
        expect(await repository.get({ id: e.id, locale: 'de' })).toBeNull();
        const trashedList = await repository.list({
            type: 'post',
            trashed: true,
            locale: 'all',
            limit: 'all',
        });
        expect(trashedList.data).toHaveLength(2);
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
        const list = await repository.versions.list(contentId);
        expect(list.map((v) => v.version)).toEqual([2, 1]);

        const one = list.find((v) => v.version === 1);
        if (!one) throw new Error('expected version 1');
        const got = await repository.versions.get(one.id);
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
        expect(await repository.versions.list(de.contentId)).toEqual([]);
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
        const deAfter = await repository.get({ id: en.id, locale: 'de' });
        expect(deAfter?.fields).toEqual({ body: 'debody', category: 'updated' });
        // The excluded locale is untouched.
        const enAfter = await repository.get({ id: en.id });
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
    // `EntryRepository` no longer carries its own `transaction`; the repository
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

        const after = await repository.get({ id: e.id });
        expect(after?.title).toBe('Keep');
    });

    it('rolls back both rows of a failed create', async () => {
        await expect(
            transaction(async () => {
                await repository.create({ type: 'post', title: 'Gone', slug: 'gone' });
                throw new Error('boom');
            })
        ).rejects.toThrow('boom');

        expect(await repository.list({ type: 'post', limit: 'all' })).toEqual({
            data: [],
            total: 0,
        });
        expect(await db.selectFrom('entryContent').selectAll().execute()).toEqual([]);
    });

    it('commits writes made inside the callback', async () => {
        const e = await repository.create({ type: 'post', title: 'Before', slug: 'b' });
        const result = await transaction(async () =>
            repository.update({ id: e.id }, { title: 'After' })
        );
        expect(result.title).toBe('After');

        const after = await repository.get({ id: e.id });
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

        const after = await repository.get({ id: created.id });
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
