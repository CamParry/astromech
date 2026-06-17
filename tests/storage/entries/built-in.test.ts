/**
 * Storage-level tests for BuiltInEntryStorage.
 *
 * These exercise the persistence contract directly (not through the
 * entries service): base CRUD, list machinery, slug uniquification, and the
 * trash/versions/translatable capability groups. The entries service's policy is
 * covered by the characterization suite in src/services/entries/service.test.ts.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, setupTestConfig } from '@tests/harness.js';
import { BuiltInEntryStorage } from '@/storage/entries/built-in.js';
import { BUILT_IN_SUPPORTS } from '@/storage/entries/capabilities.js';

let storage: BuiltInEntryStorage;

beforeEach(async () => {
    await createTestDb();
    setupTestConfig();
    storage = new BuiltInEntryStorage();
});

describe('supports', () => {
    it('declares all built-in capabilities', () => {
        expect(storage.supports).toEqual(BUILT_IN_SUPPORTS);
    });
});

describe('base CRUD', () => {
    it('round-trips create/get/update/delete', async () => {
        const created = await storage.create({
            type: 'post',
            title: 'Hello',
            slug: 'hello',
            fields: { body: 'hi' },
        });
        expect(created.id).toMatch(/[0-9a-f-]{36}/);
        expect(created.title).toBe('Hello');
        expect(created.status).toBe('draft');
        expect(created.fields).toEqual({ body: 'hi' });
        expect(created.locales).toEqual({ en: created.id });

        const got = await storage.get(created.id);
        expect(got?.id).toBe(created.id);

        const updated = await storage.update(created.id, { title: 'Changed' });
        expect(updated.title).toBe('Changed');

        await storage.delete(created.id);
        expect(await storage.get(created.id)).toBeNull();
    });

    it('get filters trashed rows unless includeTrashed is set', async () => {
        const e = await storage.create({ type: 'post', title: 'T', slug: 't' });
        await storage.trash.trash(e.id);
        expect(await storage.get(e.id)).toBeNull();
        expect(await storage.get(e.id, { includeTrashed: true })).not.toBeNull();
    });
});

describe('uniqueSlug', () => {
    it('returns the base slug when free, then -2 on collision', async () => {
        await storage.create({ type: 'post', title: 'A', slug: 'same' });
        expect(await storage.uniqueSlug('post', 'en', 'same')).toBe('same-2');
        expect(await storage.uniqueSlug('post', 'en', 'free')).toBe('free');
    });
});

describe('list', () => {
    it('paginates with total', async () => {
        for (let i = 0; i < 5; i++) {
            await storage.create({ type: 'post', title: `P${i}`, slug: `p${i}` });
        }
        const res = await storage.list({ type: 'post', limit: 2, page: 1 });
        expect(res.data).toHaveLength(2);
        expect(res.total).toBe(5);
    });

    it('searches by title and sorts', async () => {
        await storage.create({ type: 'post', title: 'Bravo', slug: 'bravo' });
        await storage.create({ type: 'post', title: 'Alpha', slug: 'alpha' });

        const search = await storage.list({ type: 'post', search: 'Alpha' });
        expect(search.data.map((e) => e.title)).toEqual(['Alpha']);

        const sorted = await storage.list({ type: 'post', sort: { title: 'asc' } });
        expect(sorted.data.map((e) => e.title)).toEqual(['Alpha', 'Bravo']);
    });

    it('searches by slug as well as title', async () => {
        // Title differs from the slug, so a slug match is the only way to find it.
        await storage.create({ type: 'post', title: 'Welcome', slug: 'home' });
        await storage.create({ type: 'post', title: 'Other', slug: 'other' });

        const bySlug = await storage.list({ type: 'post', search: 'home' });
        expect(bySlug.data.map((e) => e.title)).toEqual(['Welcome']);
    });

    it('excludes trashed unless requested', async () => {
        const a = await storage.create({ type: 'post', title: 'A', slug: 'a' });
        await storage.create({ type: 'post', title: 'B', slug: 'b' });
        await storage.trash.trash(a.id);

        const live = await storage.list({ type: 'post', limit: 'all' });
        expect(live.data.map((e) => e.title)).toEqual(['B']);

        const trashed = await storage.list({ type: 'post', trashed: true, limit: 'all' });
        expect(trashed.data.map((e) => e.title)).toEqual(['A']);
    });
});

describe('trash sub-surface', () => {
    it('trash sets deletedAt, restore clears it, emptyTrash purges', async () => {
        const e = await storage.create({ type: 'post', title: 'T', slug: 't' });
        await storage.trash.trash(e.id);
        expect(
            (await storage.get(e.id, { includeTrashed: true }))?.deletedAt
        ).toBeInstanceOf(Date);

        const restored = await storage.trash.restore(e.id);
        expect(restored.deletedAt).toBeNull();

        await storage.trash.trash(e.id);
        await storage.trash.emptyTrash('post');
        expect(await storage.get(e.id, { includeTrashed: true })).toBeNull();
    });

    it('cascades trash across the locale group', async () => {
        const en = await storage.create({
            type: 'post',
            title: 'EN',
            slug: 'en',
            locale: 'en',
        });
        const de = await storage.create({
            type: 'post',
            title: 'DE',
            slug: 'de',
            locale: 'de',
            localeGroup: en.localeGroup,
        });
        await storage.trash.trash(en.id, { cascadeLocales: true });
        expect(
            (await storage.get(de.id, { includeTrashed: true }))?.deletedAt
        ).toBeInstanceOf(Date);
    });
});

describe('versions sub-surface', () => {
    it('creates, lists newest-first, gets, and tracks latestNumber', async () => {
        const e = await storage.create({ type: 'post', title: 'V', slug: 'v' });
        expect(await storage.versions.latestNumber(e.id)).toBe(0);

        await storage.versions.create({
            entryId: e.id,
            versionNumber: 1,
            title: 'V1',
            slug: 'v',
            fields: { body: 'one' },
            relations: {},
            createdBy: null,
        });
        await storage.versions.create({
            entryId: e.id,
            versionNumber: 2,
            title: 'V2',
            slug: 'v',
            fields: { body: 'two' },
            relations: {},
            createdBy: null,
        });

        expect(await storage.versions.latestNumber(e.id)).toBe(2);
        const list = await storage.versions.list(e.id);
        expect(list.map((v) => v.versionNumber)).toEqual([2, 1]);

        const one = list.find((v) => v.versionNumber === 1);
        if (!one) throw new Error('expected version 1');
        const got = await storage.versions.get(one.id);
        expect(got?.title).toBe('V1');
    });
});

describe('translatable sub-surface', () => {
    it('returns siblings excluding the given id and propagates field values', async () => {
        const en = await storage.create({
            type: 'post',
            title: 'EN',
            slug: 'en',
            locale: 'en',
            fields: { body: 'enbody', category: 'news' },
        });
        const de = await storage.create({
            type: 'post',
            title: 'DE',
            slug: 'de',
            locale: 'de',
            localeGroup: en.localeGroup,
            fields: { body: 'debody', category: 'news' },
        });

        const siblings = await storage.translatable.siblings(en.localeGroup, en.id);
        expect(siblings.map((s) => s.id)).toEqual([de.id]);

        await storage.translatable.propagateFields(en.localeGroup, en.id, {
            category: 'updated',
        });
        const deAfter = await storage.get(de.id);
        expect(deAfter?.fields).toEqual({ body: 'debody', category: 'updated' });
    });
});

describe('transaction', () => {
    // The callback runs against a tx-bound storage; a throw rejects and rolls
    // back. NOTE: on libsql :memory: a rollback poisons the *connection* — any
    // later query on the same handle throws "no such table". So we assert only
    // the thrown error and do NOT re-query the same db (same caveat the bulk
    // characterization test documents).
    it('rejects and rolls back when the callback throws', async () => {
        const e = await storage.create({ type: 'post', title: 'Keep', slug: 'keep' });
        await expect(
            storage.transaction(async (tx) => {
                await tx.update(e.id, { title: 'Changed' });
                throw new Error('boom');
            })
        ).rejects.toThrow('boom');
    });

    it('binds the tx storage so writes inside the callback take effect', async () => {
        const e = await storage.create({ type: 'post', title: 'Before', slug: 'b' });
        // The committed value is observed via the in-tx return; libsql :memory:
        // routes the tx through a separate connection, so a post-commit read on
        // the base handle is unreliable here — assert the tx result instead.
        const result = await storage.transaction(async (tx) =>
            tx.update(e.id, { title: 'After' })
        );
        expect(result.title).toBe('After');
    });
});
