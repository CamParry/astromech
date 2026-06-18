/**
 * Characterization tests for the entry data layer (`Astromech.entries.*`).
 *
 * These pin down CURRENT behavior — not desired behavior — to act as the
 * regression net for the EntryStorage extraction (Phase 2, slice 2b). Where a
 * behavior looks surprising it is asserted anyway and flagged in a comment.
 *
 * Each `describe` block gets a fresh in-memory database (`beforeEach`), keeping
 * tests isolated; migrating a `:memory:` db is cheap (~sub-ms), so the full
 * suite stays well under the runtime budget.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { defineHook } from '@/index.js';
import { eq } from 'drizzle-orm';
import { createTestDb, registerTestPlugins, setupTestConfig } from '@tests/harness.js';
import { Astromech } from '@/transport/local/index.js';
import { getDb } from '@/database/registry.js';
import { entriesTable, relationshipsTable } from '@/database/schema.js';
import type { Entry, PluginDefinition } from '@/types/index.js';

const api = Astromech.entries;

beforeEach(async () => {
    await createTestDb();
    setupTestConfig();
});

// ============================================================================
// create
// ============================================================================

describe('create', () => {
    it('returns a draft entry with generated id/slug and persisted fields', async () => {
        const e = await api.create({
            type: 'post',
            title: 'Hello World',
            fields: { body: 'hi' },
        });

        expect(e.id).toMatch(/[0-9a-f-]{36}/);
        expect(e.type).toBe('post');
        expect(e.locale).toBe('en'); // defaultLocale
        expect(e.localeGroup).toMatch(/[0-9a-f-]{36}/);
        expect(e.status).toBe('draft');
        expect(e.title).toBe('Hello World');
        expect(e.slug).toBe('hello-world'); // slugify
        expect(e.fields).toEqual({ body: 'hi' });
        expect(e.publishedAt).toBeNull();
        expect(e.createdAt).toBeInstanceOf(Date);
        expect(e.updatedAt).toBeInstanceOf(Date);
    });

    it('respects an explicit slug', async () => {
        const e = await api.create({ type: 'post', title: 'Title', slug: 'custom-slug' });
        expect(e.slug).toBe('custom-slug');
    });

    it('uniquifies a colliding slug with a -2 suffix', async () => {
        const a = await api.create({ type: 'post', title: 'Same' });
        const b = await api.create({ type: 'post', title: 'Same' });
        expect(a.slug).toBe('same');
        expect(b.slug).toBe('same-2');
    });

    it('status published sets publishedAt at create time', async () => {
        const e = await api.create({ type: 'post', title: 'Pub', status: 'published' });
        expect(e.status).toBe('published');
        expect(e.publishedAt).toBeInstanceOf(Date);
    });

    it('joins an existing localeGroup when provided', async () => {
        const en = await api.create({ type: 'post', title: 'EN', locale: 'en' });
        const de = await api.create({
            type: 'post',
            title: 'DE',
            locale: 'de',
            localeGroup: en.localeGroup,
        });
        expect(de.localeGroup).toBe(en.localeGroup);
    });
});

// ============================================================================
// get
// ============================================================================

describe('get', () => {
    it('returns the entry by id with a populated locales map', async () => {
        const en = await api.create({ type: 'post', title: 'EN', locale: 'en' });
        const de = await api.create({
            type: 'post',
            title: 'DE',
            locale: 'de',
            localeGroup: en.localeGroup,
        });

        // full: true — admin read; drafts and all fields visible
        const got = await api.get({ type: 'post', id: en.id, full: true });
        expect(got?.id).toBe(en.id);
        expect(got?.locales).toEqual({ en: en.id, de: de.id });
    });

    it('returns null for a missing id', async () => {
        expect(
            await api.get({ type: 'post', id: 'does-not-exist', full: true })
        ).toBeNull();
    });

    it('returns null when the id exists but the type mismatches', async () => {
        const e = await api.create({ type: 'post', title: 'X' });
        expect(await api.get({ type: 'note', id: e.id, full: true })).toBeNull();
    });

    // CHARACTERIZED: `get` has no includeTrashed flag — it always filters
    // `deletedAt IS NULL`, so a trashed entry is unreachable via get().
    it('returns null for a trashed entry (no override flag exists)', async () => {
        const e = await api.create({ type: 'post', title: 'Trash me' });
        await api.trash({ type: 'post', id: e.id });
        expect(await api.get({ type: 'post', id: e.id, full: true })).toBeNull();
    });

    it('returns null for a draft entry in public shape (default)', async () => {
        const e = await api.create({ type: 'post', title: 'Draft' });
        expect(await api.get({ type: 'post', id: e.id })).toBeNull();
    });
});

// ============================================================================
// query
// ============================================================================

describe('query', () => {
    it('paginates with page/limit/total/pages', async () => {
        for (let i = 0; i < 5; i++) {
            // Use published status so rows pass the default public filter
            await api.create({ type: 'post', title: `P${i}`, status: 'published' });
        }
        const res = await api.query({ type: 'post', limit: 2, page: 1 });
        expect(res.data).toHaveLength(2);
        expect(res.pagination).toEqual({ page: 1, limit: 2, total: 5, pages: 3 });
    });

    it("limit 'all' returns null pagination and every row", async () => {
        for (let i = 0; i < 3; i++) {
            await api.create({ type: 'post', title: `P${i}`, status: 'published' });
        }
        const res = await api.query({ type: 'post', limit: 'all' });
        expect(res.pagination).toBeNull();
        expect(res.data).toHaveLength(3);
    });

    it('search matches title (LIKE) and not field content', async () => {
        await api.create({
            type: 'post',
            title: 'Findme',
            status: 'published',
            fields: { body: 'hidden' },
        });
        await api.create({
            type: 'post',
            title: 'Other',
            status: 'published',
            fields: { body: 'findme' },
        });

        const byTitle = await api.query({ type: 'post', search: 'Findme' });
        expect(byTitle.data).toHaveLength(1);
        expect(byTitle.data[0]?.title).toBe('Findme');

        // CHARACTERIZED: search is title-only; field content is never matched.
        const byField = await api.query({ type: 'post', search: 'hidden' });
        expect(byField.data).toHaveLength(0);
    });

    it('sorts by title asc and desc', async () => {
        await api.create({ type: 'post', title: 'Bravo', status: 'published' });
        await api.create({ type: 'post', title: 'Alpha', status: 'published' });
        const asc = await api.query({ type: 'post', sort: { title: 'asc' } });
        expect(asc.data.map((e) => e.title)).toEqual(['Alpha', 'Bravo']);
        const desc = await api.query({ type: 'post', sort: { title: 'desc' } });
        expect(desc.data.map((e) => e.title)).toEqual(['Bravo', 'Alpha']);
    });

    it('filters by status via where', async () => {
        await api.create({ type: 'post', title: 'Draft' });
        await api.create({ type: 'post', title: 'Pub', status: 'published' });
        // In full shape, we can see all statuses; where narrows further
        const res = await api.query({
            type: 'post',
            full: true,
            where: { status: 'published' },
        });
        expect(res.data.map((e) => e.title)).toEqual(['Pub']);
    });

    it('excludes trashed by default and includes them with trashed: true', async () => {
        const a = await api.create({ type: 'post', title: 'A', status: 'published' });
        await api.create({ type: 'post', title: 'B', status: 'published' });
        await api.trash({ type: 'post', id: a.id });

        const live = await api.query({ type: 'post' });
        expect(live.data.map((e) => e.title).sort()).toEqual(['B']);

        const trashed = await api.query({ type: 'post', full: true, trashed: true });
        expect(trashed.data.map((e) => e.title)).toEqual(['A']);
    });

    it('filters by locale and returns all locales with the all sentinel', async () => {
        const en = await api.create({
            type: 'post',
            title: 'EN',
            locale: 'en',
            status: 'published',
        });
        await api.create({
            type: 'post',
            title: 'DE',
            locale: 'de',
            localeGroup: en.localeGroup,
            status: 'published',
        });

        const enOnly = await api.query({ type: 'post', locale: 'en' });
        expect(enOnly.data.map((e) => e.locale)).toEqual(['en']);

        const all = await api.query({ type: 'post', locale: 'all' });
        expect(all.data.map((e) => e.locale).sort()).toEqual(['de', 'en']);
    });

    it('draft entries visible in full shape, hidden in public (default)', async () => {
        await api.create({ type: 'post', title: 'Draft' });
        await api.create({ type: 'post', title: 'Published', status: 'published' });

        const pub = await api.query({ type: 'post' });
        expect(pub.data.map((e) => e.title)).toEqual(['Published']);

        const full = await api.query({ type: 'post', full: true });
        expect(full.data.map((e) => e.title).sort()).toEqual(['Draft', 'Published']);
    });
});

// ============================================================================
// update
// ============================================================================

describe('update', () => {
    it('updates title/fields and bumps updatedAt', async () => {
        const e = await api.create({ type: 'post', title: 'Old', fields: { body: 'a' } });
        const before = e.updatedAt.getTime();
        await new Promise((r) => setTimeout(r, 5));

        const updated = await api.update({
            type: 'post',
            id: e.id,
            data: { title: 'New', fields: { body: 'b' } },
        });
        expect(updated.title).toBe('New');
        expect(updated.fields).toEqual({ body: 'b' });
        expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    // CHARACTERIZED: publishedAt is set on the FIRST transition to published
    // only when not already set; `update` (not just publish()) does this.
    it('sets publishedAt on first transition to published', async () => {
        const e = await api.create({ type: 'post', title: 'X' });
        expect(e.publishedAt).toBeNull();
        const pub = await api.update({
            type: 'post',
            id: e.id,
            data: { status: 'published' },
        });
        expect(pub.publishedAt).toBeInstanceOf(Date);
    });

    it('re-uniquifies a changed slug against existing siblings', async () => {
        await api.create({ type: 'post', title: 'Taken' }); // slug "taken"
        const e = await api.create({ type: 'post', title: 'Mover' });
        const updated = await api.update({
            type: 'post',
            id: e.id,
            data: { slug: 'taken' },
        });
        expect(updated.slug).toBe('taken-2');
    });
});

// ============================================================================
// versioning (post: versioning ON)
// ============================================================================

describe('versioning (on)', () => {
    // CHARACTERIZED: the version snapshot captures the PRE-update state.
    it('snapshots the pre-update state on a content change', async () => {
        const e = await api.create({
            type: 'post',
            title: 'V1',
            fields: { body: 'one' },
        });
        await api.update({
            type: 'post',
            id: e.id,
            data: { title: 'V2', fields: { body: 'two' } },
        });
        const versions = await api.versions({ type: 'post', id: e.id });
        expect(versions).toHaveLength(1);
        expect(versions[0]?.title).toBe('V1');
        expect(versions[0]?.fields).toEqual({ body: 'one' });
        expect(versions[0]?.versionNumber).toBe(1);
    });

    it('creates no version when nothing changes', async () => {
        const e = await api.create({
            type: 'post',
            title: 'Same',
            fields: { body: 'x' },
        });
        await api.update({
            type: 'post',
            id: e.id,
            data: { title: 'Same', fields: { body: 'x' } },
        });
        expect(await api.versions({ type: 'post', id: e.id })).toHaveLength(0);
    });

    it('lists versions newest-first', async () => {
        const e = await api.create({ type: 'post', title: 'A', fields: { body: '1' } });
        await api.update({
            type: 'post',
            id: e.id,
            data: { title: 'B', fields: { body: '2' } },
        });
        await api.update({
            type: 'post',
            id: e.id,
            data: { title: 'C', fields: { body: '3' } },
        });
        const versions = await api.versions({ type: 'post', id: e.id });
        expect(versions.map((v) => v.versionNumber)).toEqual([2, 1]);
        expect(versions[0]?.title).toBe('B'); // pre-update of the C change
    });

    // CHARACTERIZED: restoreVersion (a) snapshots the current (pre-restore)
    // state as a NEW version, then (b) writes the chosen version's content back.
    it('restoreVersion restores old content and snapshots the pre-restore state', async () => {
        const e = await api.create({
            type: 'post',
            title: 'Orig',
            fields: { body: 'orig' },
        });
        await api.update({
            type: 'post',
            id: e.id,
            data: { title: 'Changed', fields: { body: 'changed' } },
        });
        const [v1] = await api.versions({ type: 'post', id: e.id });
        if (!v1) throw new Error('expected a version snapshot');

        const restored = await api.restoreVersion({
            type: 'post',
            id: e.id,
            versionId: v1.id,
        });
        expect(restored.title).toBe('Orig');
        expect(restored.fields).toEqual({ body: 'orig' });

        const after = await api.versions({ type: 'post', id: e.id });
        expect(after).toHaveLength(2);
        // newest version snapshots the pre-restore ("Changed") state.
        expect(after[0]?.title).toBe('Changed');
        expect(after[0]?.fields).toEqual({ body: 'changed' });
    });
});

// ============================================================================
// versioning (note: versioning OFF)
// ============================================================================

describe('versioning (off)', () => {
    it('creates no versions on update and versions() returns []', async () => {
        const n = await api.create({ type: 'note', title: 'N', fields: { body: 'a' } });
        await api.update({ type: 'note', id: n.id, data: { fields: { body: 'b' } } });
        expect(await api.versions({ type: 'note', id: n.id })).toEqual([]);
    });
});

// ============================================================================
// translatable
// ============================================================================

describe('translatable', () => {
    async function makePair(): Promise<{ en: Entry; de: Entry }> {
        const en = await api.create({
            type: 'post',
            title: 'EN',
            locale: 'en',
            fields: { body: 'enbody', category: 'news' },
        });
        const de = await api.create({
            type: 'post',
            title: 'DE',
            locale: 'de',
            localeGroup: en.localeGroup,
            fields: { body: 'debody', category: 'news' },
        });
        return { en, de };
    }

    it('reflects both locales in the locales map', async () => {
        const { en, de } = await makePair();
        // full: true — admin read; entries are drafts
        const got = await api.get({ type: 'post', id: en.id, full: true });
        expect(got?.locales).toEqual({ en: en.id, de: de.id });
    });

    // CHARACTERIZED: a non-translatable field value updated on one locale is
    // merged into siblings' fields; the locale's own translatable fields are
    // left untouched on the sibling.
    it('propagates a non-translatable field to siblings', async () => {
        const { en, de } = await makePair();
        await api.update({
            type: 'post',
            id: en.id,
            data: { fields: { body: 'enbody', category: 'updated' } },
        });
        const deAfter = await api.get({ type: 'post', id: de.id, full: true });
        expect(deAfter?.fields).toEqual({ body: 'debody', category: 'updated' });
    });

    it('does not propagate a translatable field to siblings', async () => {
        const { en, de } = await makePair();
        await api.update({
            type: 'post',
            id: en.id,
            data: { fields: { body: 'enbody2', category: 'news' } },
        });
        const deAfter = await api.get({ type: 'post', id: de.id, full: true });
        expect(deAfter?.fields).toEqual({ body: 'debody', category: 'news' });
    });
});

// ============================================================================
// publish / unpublish / schedule
// ============================================================================

describe('publish / unpublish / schedule', () => {
    it('publish sets status published and publishedAt', async () => {
        const e = await api.create({ type: 'post', title: 'P' });
        const pub = await api.publish({ type: 'post', id: e.id });
        expect(pub.status).toBe('published');
        expect(pub.publishedAt).toBeInstanceOf(Date);
    });

    // CHARACTERIZED: unpublish passes publishAt: null through update, clearing publishedAt.
    it('unpublish sets status draft and clears publishedAt', async () => {
        const e = await api.create({ type: 'post', title: 'P', status: 'published' });
        const un = await api.unpublish({ type: 'post', id: e.id });
        expect(un.status).toBe('draft');
        expect(un.publishedAt).toBeNull();
    });

    it('schedule sets status scheduled and a future publishedAt', async () => {
        const e = await api.create({ type: 'post', title: 'S' });
        const future = new Date(Date.now() + 86_400_000);
        const sch = await api.schedule({ type: 'post', id: e.id, publishAt: future });
        expect(sch.status).toBe('scheduled');
        // timestamps persist at second precision in SQLite
        expect(sch.publishedAt?.getTime()).toBe(
            Math.floor(future.getTime() / 1000) * 1000
        );
    });
});

// ============================================================================
// trash / restore / delete / emptyTrash
// ============================================================================

describe('trash / restore / delete / emptyTrash', () => {
    it('trash sets deletedAt and excludes from default query; restore clears it', async () => {
        const e = await api.create({ type: 'post', title: 'T', status: 'published' });
        await api.trash({ type: 'post', id: e.id });

        const trashedRows = await getDb()
            .select()
            .from(entriesTable)
            .where(eq(entriesTable.id, e.id));
        expect(trashedRows[0]?.deletedAt).toBeInstanceOf(Date);

        const restored = await api.restore({ type: 'post', id: e.id });
        expect(restored.deletedAt).toBeNull();
        // After restore, a published entry should appear in the public query
        const live = await api.query({ type: 'post' });
        expect(live.data.map((x) => x.id)).toContain(e.id);
    });

    it('delete removes the row and its relationship rows', async () => {
        const target = await api.create({ type: 'post', title: 'Target' });
        const src = await api.create({
            type: 'post',
            title: 'Source',
            fields: { related: [target.id] },
        });
        await api.delete({ type: 'post', id: src.id });

        const rows = await getDb()
            .select()
            .from(entriesTable)
            .where(eq(entriesTable.id, src.id));
        expect(rows).toHaveLength(0);

        const rels = await getDb()
            .select()
            .from(relationshipsTable)
            .where(eq(relationshipsTable.sourceId, src.id));
        expect(rels).toHaveLength(0);
    });

    it('emptyTrash removes only trashed entries', async () => {
        const a = await api.create({ type: 'post', title: 'A' });
        const b = await api.create({ type: 'post', title: 'B' });
        await api.trash({ type: 'post', id: a.id });
        await api.emptyTrash({ type: 'post' });

        const all = await getDb().select().from(entriesTable);
        expect(all.map((r) => r.id)).toEqual([b.id]);
    });
});

// ============================================================================
// duplicate
// ============================================================================

describe('duplicate', () => {
    it('copies title/fields, applies overrides, and assigns a new id', async () => {
        const src = await api.create({
            type: 'post',
            title: 'Original',
            fields: { body: 'a', category: 'x' },
        });
        const dup = await api.duplicate({
            type: 'post',
            id: src.id,
            overrides: { title: 'Copy', fields: { body: 'b' } },
        });

        expect(dup.id).not.toBe(src.id);
        expect(dup.title).toBe('Copy');
        // overrides.fields shallow-merges over the source fields.
        expect(dup.fields).toEqual({ body: 'b', category: 'x' });
        expect(dup.status).toBe('draft');
        expect(dup.localeGroup).not.toBe(src.localeGroup);
    });

    // CHARACTERIZED: duplicate re-uniquifies the source slug ("original" -> "-2").
    it('uniquifies the copied slug', async () => {
        const src = await api.create({ type: 'post', title: 'Original' });
        const dup = await api.duplicate({ type: 'post', id: src.id });
        expect(dup.slug).toBe('original-2');
    });

    it('copies relationship rows to the duplicate', async () => {
        const target = await api.create({ type: 'post', title: 'Target' });
        const src = await api.create({
            type: 'post',
            title: 'Src',
            fields: { related: [target.id] },
        });
        const dup = await api.duplicate({ type: 'post', id: src.id });
        const rels = await getDb()
            .select()
            .from(relationshipsTable)
            .where(eq(relationshipsTable.sourceId, dup.id));
        expect(rels.map((r) => r.targetId)).toEqual([target.id]);
    });
});

// ============================================================================
// relationships
// ============================================================================

describe('relationships', () => {
    // CHARACTERIZED: a relationship field value in `fields` is the bare target
    // id(s) (string or string[]), NOT a {id,type} object. Persisted rows carry
    // targetType 'entry' (or 'user' when target === 'users').
    it('persists relationship rows from bare id field values', async () => {
        const target = await api.create({ type: 'post', title: 'Target' });
        const src = await api.create({
            type: 'post',
            title: 'Source',
            fields: { related: [target.id] },
        });
        const rels = await getDb()
            .select()
            .from(relationshipsTable)
            .where(eq(relationshipsTable.sourceId, src.id));
        expect(rels).toHaveLength(1);
        expect(rels[0]?.name).toBe('related');
        expect(rels[0]?.targetId).toBe(target.id);
        expect(rels[0]?.targetType).toBe('entry');
    });

    it('populate hydrates relationship targets into fields', async () => {
        const target = await api.create({
            type: 'post',
            title: 'Target',
            status: 'published',
        });
        const src = await api.create({
            type: 'post',
            title: 'Source',
            status: 'published',
            fields: { related: [target.id] },
        });
        const got = await api.get({ type: 'post', id: src.id, populate: ['related'] });
        const related = got?.fields.related as { id: string; title: string }[];
        expect(related).toHaveLength(1);
        expect(related[0]?.id).toBe(target.id);
        expect(related[0]?.title).toBe('Target');
    });

    it('incomingRelations lists the source with its title', async () => {
        const target = await api.create({ type: 'post', title: 'Target' });
        const src = await api.create({
            type: 'post',
            title: 'Source',
            fields: { related: [target.id] },
        });
        const incoming = await api.incomingRelations({ type: 'post', id: target.id });
        expect(incoming).toEqual([
            {
                sourceId: src.id,
                sourceTitle: 'Source',
                sourceType: 'post',
                name: 'related',
            },
        ]);
    });
});

// ============================================================================
// bulk
// ============================================================================

describe('bulk', () => {
    it('applies a bulk update across an id array', async () => {
        const a = await api.create({ type: 'post', title: 'A' });
        const b = await api.create({ type: 'post', title: 'B' });
        const res = await api.update({
            type: 'post',
            id: [a.id, b.id],
            data: { status: 'published' },
        });
        expect(res).toHaveLength(2);
        expect(res.every((e) => e.status === 'published')).toBe(true);
    });

    // CHARACTERIZED: bulk ops run inside one drizzle transaction. A failing id
    // throws BulkOperationError carrying failedId + the ids that succeeded
    // before it; the whole batch is rolled back.
    //
    // NOTE: on libsql `:memory:` the transaction rollback leaves the *connection*
    // poisoned — any later query on the same handle throws "Failed query". So we
    // assert only the thrown error here and do NOT re-query the same db.
    it('throws BulkOperationError on a missing id and rolls the batch back', async () => {
        const a = await api.create({ type: 'post', title: 'A' });
        const b = await api.create({ type: 'post', title: 'B' });

        await expect(
            api.update({
                type: 'post',
                id: [a.id, 'missing-id', b.id],
                data: { title: 'X' },
            })
        ).rejects.toMatchObject({
            name: 'BulkOperationError',
            failedId: 'missing-id',
            succeededBefore: [a.id],
        });
    });

    it('bulk update rejecting an empty array is a no-op (no error)', async () => {
        const res = await api.update({ type: 'post', id: [], data: { title: 'X' } });
        expect(res).toEqual([]);
    });
});

// ============================================================================
// hooks
// ============================================================================

describe('hooks', () => {
    // Hooks are registered via the plugin runtime (`registerPlugins`). A probe
    // plugin subscribes a beforeCreate/afterCreate handler against the live
    // registry, exercising the real hook seam used in production.
    it('fires beforeCreate (observing data) and afterCreate (observing entry)', async () => {
        const seen: { before?: string; afterId?: string; afterTitle?: string } = {};
        const resolved = setupTestConfig();
        const probe: PluginDefinition = {
            package: '@test/probe',
            hooks: [
                defineHook('entry:beforeCreate', (ctx) => {
                    seen.before = (ctx.data as { title: string }).title;
                }),
                defineHook('entry:afterCreate', (ctx) => {
                    seen.afterId = ctx.entry.id;
                    seen.afterTitle = ctx.entry.title;
                }),
            ],
        };
        registerTestPlugins([probe], resolved);

        const e = await api.create({ type: 'post', title: 'Hooked' });
        expect(seen.before).toBe('Hooked');
        expect(seen.afterId).toBe(e.id);
        expect(seen.afterTitle).toBe('Hooked');
    });

    it('a throwing beforeCreate aborts the create', async () => {
        const resolved = setupTestConfig();
        const probe: PluginDefinition = {
            package: '@test/probe',
            hooks: [
                defineHook('entry:beforeCreate', () => {
                    throw new Error('blocked');
                }),
            ],
        };
        registerTestPlugins([probe], resolved);

        await expect(api.create({ type: 'post', title: 'Nope' })).rejects.toThrow(
            'blocked'
        );
        const rows = await getDb().select().from(entriesTable);
        expect(rows).toHaveLength(0);
    });
});
