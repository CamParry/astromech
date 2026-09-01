/**
 * Characterization tests for the entry data layer (`entriesService.*`).
 *
 * These pin down CURRENT behavior — not desired behavior — to act as the
 * regression net for the EntryRepository extraction (Phase 2, slice 2b). Where a
 * behavior looks surprising it is asserted anyway and flagged in a comment.
 *
 * Each `describe` block gets a fresh in-memory database (`beforeEach`), keeping
 * tests isolated; migrating a `:memory:` db is cheap (~sub-ms), so the full
 * suite stays well under the runtime budget.
 */

import type { Entry, PluginDefinition } from '@/types/index';
import { createTestDb, registerTestPlugins, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { decodeWith } from '@/database/codec';
import { getDb } from '@/database/registry';
import { entriesTable } from '@/database/tables';
import { entriesService } from '@/entries/service';
import { defineHook } from '@/plugins/define-hook';

const api = entriesService;

beforeEach(async () => {
    await createTestDb();
    setupTestConfig();
});

describe('create', () => {
    it('returns an unpublished entry with generated id/slug and persisted fields', async () => {
        const e = await api.create({
            type: 'post',
            data: { title: 'Hello World', fields: { body: 'hi' } },
        });

        expect(e.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/); // ULID
        expect(e.type).toBe('post');
        expect(e.locale).toBe('en'); // defaultLocale
        expect(e.locales).toEqual(['en']);
        expect(e.staged).toBe(false);
        expect(e.status).toBe('unpublished');
        expect(e.title).toBe('Hello World');
        expect(e.slug).toBe('hello-world'); // slugify
        expect(e.fields).toEqual({ body: 'hi' });
        expect(e.publishedAt).toBeNull();
        expect(e.createdAt).toBeInstanceOf(Date);
        expect(e.updatedAt).toBeInstanceOf(Date);
    });

    it('respects an explicit slug', async () => {
        const e = await api.create({
            type: 'post',
            data: { title: 'Title', slug: 'custom-slug' },
        });
        expect(e.slug).toBe('custom-slug');
    });

    it('uniquifies a colliding slug with a -2 suffix', async () => {
        const a = await api.create({ type: 'post', data: { title: 'Same' } });
        const b = await api.create({ type: 'post', data: { title: 'Same' } });
        expect(a.slug).toBe('same');
        expect(b.slug).toBe('same-2');
    });

    it('status published sets publishedAt at create time', async () => {
        const e = await api.create({
            type: 'post',
            data: { title: 'Pub', status: 'published' },
        });
        expect(e.status).toBe('published');
        expect(e.publishedAt).toBeInstanceOf(Date);
    });

    it('creates the row in the locale it is given', async () => {
        const de = await api.create({
            type: 'post',
            data: { title: 'DE', locale: 'de' },
        });
        expect(de.locale).toBe('de');
        expect(de.locales).toEqual(['de']);
    });
});

describe('get', () => {
    it('returns the entry by id with every locale it holds listed', async () => {
        const en = await api.create({
            type: 'post',
            data: { title: 'EN', locale: 'en' },
        });
        await api.update({
            type: 'post',
            id: en.id,
            locale: 'de',
            data: { title: 'DE' },
        });

        // full: true — admin read; unpublished entries and all fields visible
        const got = await api.get({ type: 'post', id: en.id, full: true });
        expect(got?.id).toBe(en.id);
        expect(got?.locale).toBe('en');
        expect(got?.locales).toEqual(['de', 'en']);
    });

    it('reads the locale it is asked for, and null for one with no row', async () => {
        const en = await api.create({
            type: 'post',
            data: { title: 'EN', locale: 'en' },
        });
        expect(
            await api.get({ type: 'post', id: en.id, locale: 'de', full: true })
        ).toBeNull();

        await api.update({
            type: 'post',
            id: en.id,
            locale: 'de',
            data: { title: 'DE' },
        });
        const de = await api.get({ type: 'post', id: en.id, locale: 'de', full: true });
        expect(de?.title).toBe('DE');
        expect(de?.locale).toBe('de');
    });

    it('returns null for a missing id', async () => {
        expect(
            await api.get({ type: 'post', id: 'does-not-exist', full: true })
        ).toBeNull();
    });

    it('returns null when the id exists but the type mismatches', async () => {
        const e = await api.create({ type: 'post', data: { title: 'X' } });
        expect(await api.get({ type: 'note', id: e.id, full: true })).toBeNull();
    });

    // CHARACTERIZED: `get` has no includeTrashed flag — it always filters
    // `deletedAt IS NULL`, so a trashed entry is unreachable via get().
    it('returns null for a trashed entry (no override flag exists)', async () => {
        const e = await api.create({ type: 'post', data: { title: 'Trash me' } });
        await api.trash({ type: 'post', id: e.id });
        expect(await api.get({ type: 'post', id: e.id, full: true })).toBeNull();
    });

    it('returns null for an unpublished entry in public shape (default)', async () => {
        const e = await api.create({ type: 'post', data: { title: 'Draft' } });
        expect(await api.get({ type: 'post', id: e.id })).toBeNull();
    });
});

describe('query', () => {
    it('paginates with page/limit/total/pages', async () => {
        for (let i = 0; i < 5; i++) {
            // Use published status so rows pass the default public filter
            await api.create({
                type: 'post',
                data: { title: `P${i}`, status: 'published' },
            });
        }
        const res = await api.query({ type: 'post', limit: 2, page: 1 });
        expect(res.data).toHaveLength(2);
        expect(res.pagination).toEqual({ page: 1, limit: 2, total: 5, pages: 3 });
    });

    it("limit 'all' returns null pagination and every row", async () => {
        for (let i = 0; i < 3; i++) {
            await api.create({
                type: 'post',
                data: { title: `P${i}`, status: 'published' },
            });
        }
        const res = await api.query({ type: 'post', limit: 'all' });
        expect(res.pagination).toBeNull();
        expect(res.data).toHaveLength(3);
    });

    it('search matches title (LIKE) and not field content', async () => {
        await api.create({
            type: 'post',
            data: { title: 'Findme', status: 'published', fields: { body: 'hidden' } },
        });
        await api.create({
            type: 'post',
            data: { title: 'Other', status: 'published', fields: { body: 'findme' } },
        });

        const byTitle = await api.query({ type: 'post', search: 'Findme' });
        expect(byTitle.data).toHaveLength(1);
        expect(byTitle.data[0]?.title).toBe('Findme');

        // CHARACTERIZED: search is title-only; field content is never matched.
        const byField = await api.query({ type: 'post', search: 'hidden' });
        expect(byField.data).toHaveLength(0);
    });

    it('sorts by title asc and desc', async () => {
        await api.create({ type: 'post', data: { title: 'Bravo', status: 'published' } });
        await api.create({ type: 'post', data: { title: 'Alpha', status: 'published' } });
        const asc = await api.query({ type: 'post', sort: { title: 'asc' } });
        expect(asc.data.map((e) => e.title)).toEqual(['Alpha', 'Bravo']);
        const desc = await api.query({ type: 'post', sort: { title: 'desc' } });
        expect(desc.data.map((e) => e.title)).toEqual(['Bravo', 'Alpha']);
    });

    it('filters by status via where', async () => {
        await api.create({ type: 'post', data: { title: 'Draft' } });
        await api.create({ type: 'post', data: { title: 'Pub', status: 'published' } });
        // In full shape, we can see all statuses; where narrows further
        const res = await api.query({
            type: 'post',
            full: true,
            where: { status: 'published' },
        });
        expect(res.data.map((e) => e.title)).toEqual(['Pub']);
    });

    it('excludes trashed by default and includes them with trashed: true', async () => {
        const a = await api.create({
            type: 'post',
            data: { title: 'A', status: 'published' },
        });
        await api.create({ type: 'post', data: { title: 'B', status: 'published' } });
        await api.trash({ type: 'post', id: a.id });

        const live = await api.query({ type: 'post' });
        expect(live.data.map((e) => e.title).sort()).toEqual(['B']);

        const trashed = await api.query({ type: 'post', full: true, trashed: true });
        expect(trashed.data.map((e) => e.title)).toEqual(['A']);
    });

    it('rejects a trashed read in the public shape', async () => {
        // Public visibility drops every trashed row, so the combination would
        // otherwise return an empty list indistinguishable from "nothing is trashed".
        const a = await api.create({
            type: 'post',
            data: { title: 'A', status: 'published' },
        });
        await api.trash({ type: 'post', id: a.id });

        await expect(api.query({ type: 'post', trashed: true })).rejects.toThrow(
            /trashed reads require the full shape/
        );
    });

    it('filters by locale and returns all locales with the all sentinel', async () => {
        const en = await api.create({
            type: 'post',
            data: { title: 'EN', locale: 'en', status: 'published' },
        });
        await api.update({
            type: 'post',
            id: en.id,
            locale: 'de',
            data: { title: 'DE', status: 'published' },
        });

        const enOnly = await api.query({ type: 'post', locale: 'en' });
        expect(enOnly.data.map((e) => e.locale)).toEqual(['en']);

        const all = await api.query({ type: 'post', locale: 'all' });
        expect(all.data.map((e) => e.locale).sort()).toEqual(['de', 'en']);
    });

    it('unpublished entries visible in full shape, hidden in public (default)', async () => {
        await api.create({ type: 'post', data: { title: 'Draft' } });
        await api.create({
            type: 'post',
            data: { title: 'Published', status: 'published' },
        });

        const pub = await api.query({ type: 'post' });
        expect(pub.data.map((e) => e.title)).toEqual(['Published']);

        const full = await api.query({ type: 'post', full: true });
        expect(full.data.map((e) => e.title).sort()).toEqual(['Draft', 'Published']);
    });
});

describe('update', () => {
    it('updates title/fields and bumps updatedAt', async () => {
        const e = await api.create({
            type: 'post',
            data: { title: 'Old', fields: { body: 'a' } },
        });
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
        const e = await api.create({ type: 'post', data: { title: 'X' } });
        expect(e.publishedAt).toBeNull();
        const pub = await api.update({
            type: 'post',
            id: e.id,
            data: { status: 'published' },
        });
        expect(pub.publishedAt).toBeInstanceOf(Date);
    });

    it('re-uniquifies a changed slug against existing siblings', async () => {
        await api.create({ type: 'post', data: { title: 'Taken' } }); // slug "taken"
        const e = await api.create({ type: 'post', data: { title: 'Mover' } });
        const updated = await api.update({
            type: 'post',
            id: e.id,
            data: { slug: 'taken' },
        });
        expect(updated.slug).toBe('taken-2');
    });
});

describe('versioning (on)', () => {
    // CHARACTERIZED: the version snapshot captures the PRE-update state.
    it('snapshots the pre-update state on a content change', async () => {
        const e = await api.create({
            type: 'post',
            data: { title: 'V1', fields: { body: 'one' } },
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
        expect(versions[0]?.version).toBe(1);
        expect(versions[0]?.entryId).toBe(e.id);
        expect(versions[0]?.locale).toBe('en');
    });

    it('keeps a separate version sequence per locale', async () => {
        const e = await api.create({
            type: 'post',
            data: { title: 'EN v1', fields: { body: 'one' } },
        });
        await api.update({
            type: 'post',
            id: e.id,
            locale: 'de',
            data: { title: 'DE v1', fields: { body: 'eins' } },
        });
        await api.update({
            type: 'post',
            id: e.id,
            data: { title: 'EN v2', fields: { body: 'two' } },
        });
        await api.update({
            type: 'post',
            id: e.id,
            locale: 'de',
            data: { title: 'DE v2', fields: { body: 'zwei' } },
        });

        const en = await api.versions({ type: 'post', id: e.id });
        const de = await api.versions({ type: 'post', id: e.id, locale: 'de' });

        expect(en.map((v) => v.title)).toEqual(['EN v1']);
        expect(de.map((v) => v.title)).toEqual(['DE v1']);
        // Both sequences start at 1, and each version names its own locale.
        expect(en.map((v) => v.version)).toEqual([1]);
        expect(de.map((v) => v.version)).toEqual([1]);
        expect(en[0]?.locale).toBe('en');
        expect(de[0]?.locale).toBe('de');
        expect(de[0]?.entryId).toBe(e.id);
    });

    it('restores a version into its own locale, leaving the other alone', async () => {
        const e = await api.create({ type: 'post', data: { title: 'EN v1' } });
        await api.update({
            type: 'post',
            id: e.id,
            locale: 'de',
            data: { title: 'DE v1' },
        });
        await api.update({
            type: 'post',
            id: e.id,
            locale: 'de',
            data: { title: 'DE v2' },
        });

        const [version] = await api.versions({ type: 'post', id: e.id, locale: 'de' });
        if (!version) throw new Error('expected a de version');
        const restored = await api.restoreVersion({
            type: 'post',
            id: e.id,
            versionId: version.id,
            locale: 'de',
        });

        expect(restored.title).toBe('DE v1');
        expect(restored.locale).toBe('de');
        const en = await api.get({ type: 'post', id: e.id, full: true });
        expect(en?.title).toBe('EN v1');
    });

    it('refuses a version that belongs to another locale', async () => {
        const e = await api.create({ type: 'post', data: { title: 'EN v1' } });
        await api.update({ type: 'post', id: e.id, data: { title: 'EN v2' } });
        const [version] = await api.versions({ type: 'post', id: e.id });
        if (!version) throw new Error('expected an en version');
        await api.update({
            type: 'post',
            id: e.id,
            locale: 'de',
            data: { title: 'DE' },
        });

        await expect(
            api.restoreVersion({
                type: 'post',
                id: e.id,
                versionId: version.id,
                locale: 'de',
            })
        ).rejects.toThrow(/Version not found/);
    });

    it('creates no version when nothing changes', async () => {
        const e = await api.create({
            type: 'post',
            data: { title: 'Same', fields: { body: 'x' } },
        });
        await api.update({
            type: 'post',
            id: e.id,
            data: { title: 'Same', fields: { body: 'x' } },
        });
        expect(await api.versions({ type: 'post', id: e.id })).toHaveLength(0);
    });

    it('lists versions newest-first', async () => {
        const e = await api.create({
            type: 'post',
            data: { title: 'A', fields: { body: '1' } },
        });
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
        expect(versions.map((v) => v.version)).toEqual([2, 1]);
        expect(versions[0]?.title).toBe('B'); // pre-update of the C change
    });

    // CHARACTERIZED: restoreVersion (a) snapshots the current (pre-restore)
    // state as a NEW version, then (b) writes the chosen version's content back.
    it('restoreVersion restores old content and snapshots the pre-restore state', async () => {
        const e = await api.create({
            type: 'post',
            data: { title: 'Orig', fields: { body: 'orig' } },
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

describe('versioning (off)', () => {
    it('creates no versions on update and versions() returns []', async () => {
        const n = await api.create({
            type: 'note',
            data: { title: 'N', fields: { body: 'a' } },
        });
        await api.update({ type: 'note', id: n.id, data: { fields: { body: 'b' } } });
        expect(await api.versions({ type: 'note', id: n.id })).toEqual([]);
    });
});

describe('translatable', () => {
    async function makePair(): Promise<{ en: Entry; de: Entry }> {
        const en = await api.create({
            type: 'post',
            data: {
                title: 'EN',
                locale: 'en',
                fields: { body: 'enbody', category: 'news' },
            },
        });
        const de = await api.update({
            type: 'post',
            id: en.id,
            locale: 'de',
            data: { title: 'DE', fields: { body: 'debody', category: 'news' } },
        });
        return { en, de };
    }

    it('lists both locales on either read', async () => {
        const { en } = await makePair();
        // full: true — admin read; entries are unpublished
        const got = await api.get({ type: 'post', id: en.id, full: true });
        expect(got?.locales).toEqual(['de', 'en']);
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
        const deAfter = await api.get({
            type: 'post',
            id: de.id,
            locale: 'de',
            full: true,
        });
        expect(deAfter?.fields).toEqual({ body: 'debody', category: 'updated' });
    });

    it('does not propagate a translatable field to siblings', async () => {
        const { en, de } = await makePair();
        await api.update({
            type: 'post',
            id: en.id,
            data: { fields: { body: 'enbody2', category: 'news' } },
        });
        const deAfter = await api.get({
            type: 'post',
            id: de.id,
            locale: 'de',
            full: true,
        });
        expect(deAfter?.fields).toEqual({ body: 'debody', category: 'news' });
    });
});

describe('publish / unpublish / schedule', () => {
    it('publish sets status published and publishedAt', async () => {
        const e = await api.create({ type: 'post', data: { title: 'P' } });
        const pub = await api.publish({ type: 'post', id: e.id });
        expect(pub.status).toBe('published');
        expect(pub.publishedAt).toBeInstanceOf(Date);
    });

    // CHARACTERIZED: unpublish passes publishedAt: null through update, clearing publishedAt.
    it('unpublish sets status to unpublished and clears publishedAt', async () => {
        const e = await api.create({
            type: 'post',
            data: { title: 'P', status: 'published' },
        });
        const un = await api.unpublish({ type: 'post', id: e.id });
        expect(un.status).toBe('unpublished');
        expect(un.publishedAt).toBeNull();
    });

    it('schedule sets status scheduled and a future publishedAt', async () => {
        const e = await api.create({ type: 'post', data: { title: 'S' } });
        const future = new Date(Date.now() + 86_400_000);
        const sch = await api.schedule({ type: 'post', id: e.id, publishedAt: future });
        expect(sch.status).toBe('scheduled');
        // Tier-1 timestamps persist as ISO-TEXT (millisecond precision).
        expect(sch.publishedAt?.getTime()).toBe(future.getTime());
    });
});

describe('trash / restore / delete / emptyTrash', () => {
    it('trash sets deletedAt and excludes from default query; restore clears it', async () => {
        const e = await api.create({
            type: 'post',
            data: { title: 'T', status: 'published' },
        });
        await api.trash({ type: 'post', id: e.id });

        const trashedRows = await getDb()
            .selectFrom('entries')
            .selectAll()
            .where('id', '=', e.id)
            .execute();
        const decoded = trashedRows.map((r) => decodeWith(entriesTable, r));
        expect(decoded[0]?.deletedAt).toBeInstanceOf(Date);

        const restored = await api.restore({ type: 'post', id: e.id });
        expect(restored.deletedAt).toBeNull();
        // After restore, a published entry should appear in the public query
        const live = await api.query({ type: 'post' });
        expect(live.data.map((x) => x.id)).toContain(e.id);
    });

    it('delete removes the row and its relationship rows', async () => {
        const target = await api.create({ type: 'post', data: { title: 'Target' } });
        const src = await api.create({
            type: 'post',
            data: { title: 'Source', fields: { related: [target.id] } },
        });
        await api.delete({ type: 'post', id: src.id });

        const rows = await getDb()
            .selectFrom('entries')
            .selectAll()
            .where('id', '=', src.id)
            .execute();
        expect(rows).toHaveLength(0);

        const rels = await getDb()
            .selectFrom('relationships')
            .selectAll()
            .where('sourceId', '=', src.id)
            .execute();
        expect(rels).toHaveLength(0);
    });

    it('emptyTrash removes only trashed entries', async () => {
        const a = await api.create({ type: 'post', data: { title: 'A' } });
        const b = await api.create({ type: 'post', data: { title: 'B' } });
        await api.trash({ type: 'post', id: a.id });
        await api.emptyTrash({ type: 'post' });

        const all = await getDb().selectFrom('entries').selectAll().execute();
        expect(all.map((r) => r.id)).toEqual([b.id]);
    });
});

describe('trash and delete are resource-level', () => {
    /** One entry with an `en` and a `de` content row. */
    async function makeLocalePair(): Promise<Entry> {
        const en = await api.create({
            type: 'post',
            data: { title: 'EN', locale: 'en' },
        });
        await api.update({
            type: 'post',
            id: en.id,
            locale: 'de',
            data: { title: 'DE' },
        });
        return en;
    }

    it('trash hides every locale, and restore brings them all back', async () => {
        const entry = await makeLocalePair();
        await api.trash({ type: 'post', id: entry.id });

        expect(await api.get({ type: 'post', id: entry.id, full: true })).toBeNull();
        expect(
            await api.get({ type: 'post', id: entry.id, locale: 'de', full: true })
        ).toBeNull();

        const trashed = await api.query({
            type: 'post',
            locale: 'all',
            full: true,
            trashed: true,
        });
        expect(trashed.data.map((e) => e.locale).sort()).toEqual(['de', 'en']);
        expect(trashed.data.every((e) => e.deletedAt instanceof Date)).toBe(true);

        await api.restore({ type: 'post', id: entry.id });

        const en = await api.get({ type: 'post', id: entry.id, full: true });
        const de = await api.get({
            type: 'post',
            id: entry.id,
            locale: 'de',
            full: true,
        });
        expect(en?.title).toBe('EN');
        expect(de?.title).toBe('DE');
        expect(en?.deletedAt).toBeNull();
    });

    it('delete removes the entry and every content row it has', async () => {
        const entry = await makeLocalePair();
        await api.delete({ type: 'post', id: entry.id });

        const entries = await getDb()
            .selectFrom('entries')
            .selectAll()
            .where('id', '=', entry.id)
            .execute();
        const contents = await getDb()
            .selectFrom('entryContent')
            .selectAll()
            .where('entryId', '=', entry.id)
            .execute();
        expect(entries).toHaveLength(0);
        expect(contents).toHaveLength(0);
    });
});

describe('duplicate', () => {
    it('copies title/fields, applies overrides, and assigns a new id', async () => {
        const src = await api.create({
            type: 'post',
            data: { title: 'Original', fields: { body: 'a', category: 'x' } },
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
        expect(dup.status).toBe('unpublished');
    });

    it('copies every locale under the new id', async () => {
        const src = await api.create({
            type: 'post',
            data: { title: 'EN', locale: 'en', fields: { body: 'a' } },
        });
        await api.update({
            type: 'post',
            id: src.id,
            locale: 'de',
            data: { title: 'DE', fields: { body: 'b' } },
        });

        const dup = await api.duplicate({ type: 'post', id: src.id });

        expect(dup.id).not.toBe(src.id);
        expect(dup.locales).toEqual(['de', 'en']);
        const de = await api.get({ type: 'post', id: dup.id, locale: 'de', full: true });
        expect(de?.title).toBe('DE');
        expect(de?.fields['body']).toBe('b');
        // A translation inherits the default locale's slug, and the copy
        // re-uniques it within its own locale.
        expect(de?.slug).toBe('en-2');
    });

    it('copies one locale alone when overrides name it', async () => {
        const src = await api.create({
            type: 'post',
            data: { title: 'EN', locale: 'en' },
        });
        await api.update({
            type: 'post',
            id: src.id,
            locale: 'de',
            data: { title: 'DE' },
        });

        const dup = await api.duplicate({
            type: 'post',
            id: src.id,
            overrides: { locale: 'de' },
        });

        expect(dup.locale).toBe('de');
        expect(dup.locales).toEqual(['de']);
        expect(await api.get({ type: 'post', id: dup.id, full: true })).toBeNull();
    });

    // CHARACTERIZED: duplicate re-uniquifies the source slug ("original" -> "-2").
    it('uniquifies the copied slug', async () => {
        const src = await api.create({ type: 'post', data: { title: 'Original' } });
        const dup = await api.duplicate({ type: 'post', id: src.id });
        expect(dup.slug).toBe('original-2');
    });

    it('indexes the copy\u2019s own relationship rows', async () => {
        const target = await api.create({ type: 'post', data: { title: 'Target' } });
        const src = await api.create({
            type: 'post',
            data: { title: 'Src', fields: { related: [target.id] } },
        });
        const dup = await api.duplicate({ type: 'post', id: src.id });
        const rels = await getDb()
            .selectFrom('relationships')
            .selectAll()
            .where('sourceId', '=', dup.id)
            .execute();
        expect(rels.map((r) => r.targetId)).toEqual([target.id]);
    });
});

describe('relationships', () => {
    // A relationship field value in `fields` is the bare target id(s) (string or
    // string[]), NOT a {id,type} object. The index row derives from it.
    it('indexes relationship rows from bare id field values', async () => {
        const target = await api.create({ type: 'post', data: { title: 'Target' } });
        const src = await api.create({
            type: 'post',
            data: { title: 'Source', fields: { related: [target.id] } },
        });
        const rels = await getDb()
            .selectFrom('relationships')
            .selectAll()
            .where('sourceId', '=', src.id)
            .execute();
        expect(rels).toHaveLength(1);
        expect(rels[0]?.schemaPath).toBe('related');
        expect(rels[0]?.instancePath).toBe('related');
        expect(rels[0]?.sourceKind).toBe('entry');
        expect(rels[0]?.sourceType).toBe('post');
        expect(rels[0]?.targetId).toBe(target.id);
        expect(rels[0]?.targetKind).toBe('entry');
    });

    // The old subsystem skipped falsy values, so clearing a relation left its
    // row behind. A write replaces the whole source's edge set.
    it('drops the index row when the relation is cleared', async () => {
        const target = await api.create({ type: 'post', data: { title: 'Target' } });
        const src = await api.create({
            type: 'post',
            data: { title: 'Source', fields: { related: [target.id] } },
        });
        await api.update({ type: 'post', id: src.id, data: { fields: { related: [] } } });

        const rels = await getDb()
            .selectFrom('relationships')
            .selectAll()
            .where('sourceId', '=', src.id)
            .execute();
        expect(rels).toHaveLength(0);
    });

    it('incomingRelationships lists the source with its title', async () => {
        const target = await api.create({ type: 'post', data: { title: 'Target' } });
        const src = await api.create({
            type: 'post',
            data: { title: 'Source', fields: { related: [target.id] } },
        });
        const incoming = await api.incomingRelationships({ type: 'post', id: target.id });
        expect(incoming).toEqual([
            {
                sourceId: src.id,
                sourceTitle: 'Source',
                sourceType: 'post',
                schemaPath: 'related',
            },
        ]);
    });
});

describe('bulk', () => {
    it('applies a bulk update across an id array', async () => {
        const a = await api.create({ type: 'post', data: { title: 'A' } });
        const b = await api.create({ type: 'post', data: { title: 'B' } });
        const res = await api.update({
            type: 'post',
            id: [a.id, b.id],
            data: { status: 'published' },
        });
        expect(res).toHaveLength(2);
        expect(res.every((e) => e.status === 'published')).toBe(true);
    });

    // CHARACTERIZED: update loads every id before opening a transaction, so a
    // missing id fails fast with the plain not-found error and never enters
    // the write loop — nothing is modified, so there is nothing to roll back.
    it('a missing id in a bulk update fails before any write, atomically', async () => {
        const a = await api.create({ type: 'post', data: { title: 'A' } });
        const b = await api.create({ type: 'post', data: { title: 'B' } });

        await expect(
            api.update({
                type: 'post',
                id: [a.id, 'missing-id', b.id],
                data: { title: 'X' },
            })
        ).rejects.toThrow(/missing-id/);

        const aAfter = await api.get({ type: 'post', id: a.id, full: true });
        const bAfter = await api.get({ type: 'post', id: b.id, full: true });
        expect(aAfter?.title).not.toBe('X');
        expect(bAfter?.title).not.toBe('X');
    });

    it('bulk update rejecting an empty array is a no-op (no error)', async () => {
        const res = await api.update({ type: 'post', id: [], data: { title: 'X' } });
        expect(res).toEqual([]);
    });
});

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

        const e = await api.create({ type: 'post', data: { title: 'Hooked' } });
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

        await expect(
            api.create({ type: 'post', data: { title: 'Nope' } })
        ).rejects.toThrow('blocked');
        const rows = await getDb().selectFrom('entries').selectAll().execute();
        expect(rows).toHaveLength(0);
    });

    // `DECISIONS.md`: a throw now
    // propagates from an after* handler instead of being swallowed and logged,
    // and the write it followed stays committed.
    it('a throwing afterDelete propagates, but the row is still gone', async () => {
        const entry = await api.create({ type: 'post', data: { title: 'Doomed' } });
        const resolved = setupTestConfig();
        const probe: PluginDefinition = {
            package: '@test/probe',
            hooks: [
                defineHook('entry:afterDelete', () => {
                    throw new Error('after-delete-fail');
                }),
            ],
        };
        registerTestPlugins([probe], resolved);

        await expect(api.delete({ type: 'post', id: entry.id })).rejects.toThrow(
            'after-delete-fail'
        );
        const rows = await getDb().selectFrom('entries').selectAll().execute();
        expect(rows).toHaveLength(0);
    });

    it('a throwing beforeDelete aborts the delete, leaving the row in place', async () => {
        const entry = await api.create({ type: 'post', data: { title: 'Safe' } });
        const resolved = setupTestConfig();
        const probe: PluginDefinition = {
            package: '@test/probe',
            hooks: [
                defineHook('entry:beforeDelete', () => {
                    throw new Error('before-delete-fail');
                }),
            ],
        };
        registerTestPlugins([probe], resolved);

        await expect(api.delete({ type: 'post', id: entry.id })).rejects.toThrow(
            'before-delete-fail'
        );
        const rows = await getDb().selectFrom('entries').selectAll().execute();
        expect(rows).toHaveLength(1);
    });
});
