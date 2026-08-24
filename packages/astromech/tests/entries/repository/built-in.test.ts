/**
 * Repository-level tests for the built-in entry repository.
 *
 * These exercise the persistence contract directly (not through the
 * entries service): base CRUD, list machinery, slug uniquification, and the
 * trash/versions/translatable capability groups. The entries service's policy is
 * covered by the characterization suite in src/services/entries/service.test.ts.
 */

import type { DB } from '@/database/types';
import type { Insertable } from 'kysely';
import { createTestDb, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { encodeWith } from '@/database/codec';
import { entriesTable } from '@/database/tables';
import { transaction } from '@/database/transaction';
import { BUILT_IN_SUPPORTS } from '@/entries/capabilities';
import { createBuiltInEntryRepository } from '@/entries/repository/built-in';

let repository: ReturnType<typeof createBuiltInEntryRepository>;
let db: Awaited<ReturnType<typeof createTestDb>>;

beforeEach(async () => {
    db = await createTestDb();
    setupTestConfig();
    repository = createBuiltInEntryRepository();
});

describe('supports', () => {
    it('declares all built-in capabilities', () => {
        expect(repository.supports).toEqual(BUILT_IN_SUPPORTS);
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
        expect(created.locales).toEqual({ en: created.id });

        const got = await repository.get(created.id);
        expect(got?.id).toBe(created.id);

        const updated = await repository.update(created.id, { title: 'Changed' });
        expect(updated.title).toBe('Changed');

        await repository.delete(created.id);
        expect(await repository.get(created.id)).toBeNull();
    });

    it('mints a ULID localeGroup, not a UUID, when none is supplied', async () => {
        // The `entries` table declares `defaultUlid` on localeGroup, so
        // repository must leave the key absent rather than minting its own id.
        const created = await repository.create({ type: 'post', title: 'L', slug: 'l' });
        expect(created.localeGroup).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    });

    it('get filters trashed rows unless includeTrashed is set', async () => {
        const e = await repository.create({ type: 'post', title: 'T', slug: 't' });
        await repository.trash.trash(e.id);
        expect(await repository.get(e.id)).toBeNull();
        expect(await repository.get(e.id, { includeTrashed: true })).not.toBeNull();
    });
});

describe('uniqueSlug', () => {
    it('returns the base slug when free, then -2 on collision', async () => {
        await repository.create({ type: 'post', title: 'A', slug: 'same' });
        expect(await repository.uniqueSlug('post', 'en', 'same')).toBe('same-2');
        expect(await repository.uniqueSlug('post', 'en', 'free')).toBe('free');
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

describe('staging (forward versioning) schema', () => {
    it('a staged row may share the canonical slug and is excluded from list + uniqueSlug', async () => {
        const canonical = await repository.create({
            type: 'post',
            title: 'Live',
            slug: 'live',
        });

        // A staged row sharing the canonical's slug: the partial unique index
        // (WHERE staged_for IS NULL) must allow this insert to succeed.
        await db
            .insertInto('entries')
            .values(
                encodeWith(entriesTable, {
                    type: 'post',
                    locale: 'en',
                    slug: 'live',
                    title: 'Staged change',
                    stagedFor: canonical.id,
                }) as unknown as Insertable<DB['entries']>
            )
            .execute();

        // Staged rows never surface in lists.
        const list = await repository.list({ type: 'post', limit: 'all' });
        expect(list.data.map((e) => e.title)).toEqual(['Live']);

        // A slug used ONLY by a staged row is still considered free.
        await db
            .insertInto('entries')
            .values(
                encodeWith(entriesTable, {
                    type: 'post',
                    locale: 'en',
                    slug: 'ghost',
                    title: 'Staged ghost',
                    stagedFor: canonical.id,
                }) as unknown as Insertable<DB['entries']>
            )
            .execute();
        expect(await repository.uniqueSlug('post', 'en', 'ghost')).toBe('ghost');

        // The canonical still occupies its own slug.
        expect(await repository.uniqueSlug('post', 'en', 'live')).toBe('live-2');
    });
});

describe('trash sub-surface', () => {
    it('trash sets deletedAt, restore clears it, emptyTrash purges', async () => {
        const e = await repository.create({ type: 'post', title: 'T', slug: 't' });
        await repository.trash.trash(e.id);
        expect(
            (await repository.get(e.id, { includeTrashed: true }))?.deletedAt
        ).toBeInstanceOf(Date);

        const restored = await repository.trash.restore(e.id);
        expect(restored.deletedAt).toBeNull();

        await repository.trash.trash(e.id);
        await repository.trash.emptyTrash('post');
        expect(await repository.get(e.id, { includeTrashed: true })).toBeNull();
    });
});

describe('versions sub-surface', () => {
    it('creates, lists newest-first, gets, and tracks latestNumber', async () => {
        const e = await repository.create({ type: 'post', title: 'V', slug: 'v' });
        expect(await repository.versions.latestNumber(e.id)).toBe(0);

        await repository.versions.create({
            entryId: e.id,
            versionNumber: 1,
            title: 'V1',
            slug: 'v',
            fields: { body: 'one' },
            createdBy: null,
        });
        await repository.versions.create({
            entryId: e.id,
            versionNumber: 2,
            title: 'V2',
            slug: 'v',
            fields: { body: 'two' },
            createdBy: null,
        });

        expect(await repository.versions.latestNumber(e.id)).toBe(2);
        const list = await repository.versions.list(e.id);
        expect(list.map((v) => v.versionNumber)).toEqual([2, 1]);

        const one = list.find((v) => v.versionNumber === 1);
        if (!one) throw new Error('expected version 1');
        const got = await repository.versions.get(one.id);
        expect(got?.title).toBe('V1');
    });
});

describe('translatable sub-surface', () => {
    it('returns siblings excluding the given id and propagates field values', async () => {
        const en = await repository.create({
            type: 'post',
            title: 'EN',
            slug: 'en',
            locale: 'en',
            fields: { body: 'enbody', category: 'news' },
        });
        const de = await repository.create({
            type: 'post',
            title: 'DE',
            slug: 'de',
            locale: 'de',
            localeGroup: en.localeGroup,
            fields: { body: 'debody', category: 'news' },
        });

        const siblings = await repository.translatable.siblings(en.localeGroup, en.id);
        expect(siblings.map((s) => s.id)).toEqual([de.id]);

        await repository.translatable.propagateFields(en.localeGroup, en.id, {
            category: 'updated',
        });
        const deAfter = await repository.get(de.id);
        expect(deAfter?.fields).toEqual({ body: 'debody', category: 'updated' });
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
                await repository.update(e.id, { title: 'Changed' });
                throw new Error('boom');
            })
        ).rejects.toThrow('boom');

        const after = await repository.get(e.id);
        expect(after?.title).toBe('Keep');
    });

    it('commits writes made inside the callback', async () => {
        const e = await repository.create({ type: 'post', title: 'Before', slug: 'b' });
        const result = await transaction(async () =>
            repository.update(e.id, { title: 'After' })
        );
        expect(result.title).toBe('After');

        const after = await repository.get(e.id);
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
                await repository.update(outer.id, { title: 'Inner' });
            });
            return outer;
        });

        const after = await repository.get(created.id);
        expect(after?.title).toBe('Inner');
    });
});
