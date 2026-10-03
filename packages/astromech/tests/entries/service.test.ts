/**
 * Characterization tests for the entry data layer (`entriesService.*`): they pin
 * current behavior, and a surprising one is asserted anyway and flagged in a
 * comment. Each test gets a fresh file-backed database with the real migrations.
 */

import type { Entry, PluginDefinition } from '@/types/index';
import { LibsqlError } from '@libsql/client';
import { expectConsole } from '@tests/console';
import {
    createTestDb,
    failWritesTo,
    makeTestConfig,
    registerTestPlugins,
    setupTestConfig,
} from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentServices } from '@/app-context/services';
import { getDb } from '@/database/registry';
import { entriesTable } from '@/database/tables';
import { entryRepository } from '@/entries/repository/entries-table';
import { HookOutputValidationError } from '@/errors/output-validation';
import { ResourceConflictError, ResourceNotFoundError } from '@/errors/resource';
import { ValidationError } from '@/errors/validation';
import { defineHook } from '@/plugins/define-hook';

const entriesService = currentServices.entries;

const api = entriesService;

beforeEach(async () => {
    await createTestDb();
    setupTestConfig();
});

afterEach(() => {
    vi.useRealTimers();
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

    it('status published stores the publishedAt it is given', async () => {
        const given = new Date('2024-01-01T00:00:00.000Z');
        const e = await api.create({
            type: 'post',
            data: { title: 'Pub', status: 'published', publishedAt: given },
        });
        expect(e.publishedAt?.getTime()).toBe(given.getTime());
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

    it('compiles a column filter through the shared where DSL', async () => {
        await api.create({ type: 'post', data: { title: 'Draft', slug: 'draft' } });
        await api.create({
            type: 'post',
            data: { title: 'Pub', slug: 'pub', status: 'published' },
        });
        const notPublished = await api.query({
            type: 'post',
            full: true,
            where: { status: { ne: 'published' } },
        });
        expect(notPublished.data.map((e) => e.title)).toEqual(['Draft']);

        const bySlug = await api.query({
            type: 'post',
            full: true,
            where: { slug: { in: ['pub', 'missing'] } },
        });
        expect(bySlug.data.map((e) => e.title)).toEqual(['Pub']);
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

    it('leaves a published entry with a future publishedAt out of the public count', async () => {
        const later = await api.create({
            type: 'post',
            data: { title: 'Later', status: 'published' },
        });
        await api.create({ type: 'post', data: { title: 'A', status: 'published' } });
        await api.create({ type: 'post', data: { title: 'B', status: 'published' } });
        // Keeps the status: an update to a published entry stores the caller's
        // publishedAt once the entry already has one.
        const future = new Date(Date.now() + 60 * 60_000);
        await api.update({ type: 'post', id: later.id, data: { publishedAt: future } });

        const pub = await api.query({ type: 'post', limit: 2, page: 1 });
        expect(pub.data.map((e) => e.title).sort()).toEqual(['A', 'B']);
        expect(pub.pagination).toEqual({ page: 1, limit: 2, total: 2, pages: 1 });

        const full = await api.query({ type: 'post', full: true, limit: 10 });
        expect(full.pagination?.total).toBe(3);
        const stored = full.data.find((e) => e.id === later.id);
        expect(stored?.status).toBe('published');
        expect(stored?.publishedAt?.getTime()).toBe(future.getTime());
    });
});

describe('update', () => {
    it('updates title/fields and bumps updatedAt', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
        const e = await api.create({
            type: 'post',
            data: { title: 'Old', fields: { body: 'a' } },
        });
        const before = e.updatedAt.getTime();
        vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'));

        const updated = await api.update({
            type: 'post',
            id: e.id,
            data: { title: 'New', fields: { body: 'b' } },
        });
        expect(updated.title).toBe('New');
        expect(updated.fields).toEqual({ body: 'b' });
        expect(updated.updatedAt.getTime()).toBeGreaterThan(before);
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

// The rules every resource's history shares are in
// `tests/content/resource-versions.test.ts`; an entry also versions its title.
describe('versioning (on)', () => {
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
        const restored = await api.restoreVersion({
            type: 'post',
            id: e.id,
            version: 1,
        });
        expect(restored.title).toBe('Orig');
        expect(restored.fields).toEqual({ body: 'orig' });

        const after = await api.versions({ type: 'post', id: e.id });
        expect(after.map((v) => v.version)).toEqual([2, 1]);
        // newest version snapshots the pre-restore ("Changed") state.
        const saved = await api.getVersion({ type: 'post', id: e.id, version: 2 });
        expect(saved.snapshot.title).toBe('Changed');
        expect(saved.snapshot.fields).toEqual({ body: 'changed' });
    });
});

describe('versioning (off)', () => {
    it('creates no versions on update, and versions() is refused', async () => {
        const n = await api.create({
            type: 'note',
            data: { title: 'N', fields: { body: 'a' } },
        });
        await api.update({ type: 'note', id: n.id, data: { fields: { body: 'b' } } });
        expect(await getDb().selectFrom('entryVersions').selectAll().execute()).toEqual(
            []
        );
        await expect(api.versions({ type: 'note', id: n.id })).rejects.toMatchObject({
            name: 'CapabilityError',
            capability: 'versioning',
        });
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

    it("moves every locale's updatedAt with a write to one of them", async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
        const { en } = await makePair();
        const later = new Date('2026-01-02T00:00:00.000Z');
        vi.setSystemTime(later);

        await api.update({
            type: 'post',
            id: en.id,
            locale: 'de',
            data: { title: 'DE 2' },
        });

        const enAfter = await api.get({ type: 'post', id: en.id, full: true });
        expect(enAfter?.updatedAt).toEqual(later);
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

    it('publish stamps the entry row updatedAt', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
        const e = await api.create({ type: 'post', data: { title: 'P' } });
        const later = new Date('2026-01-02T00:00:00.000Z');
        vi.setSystemTime(later);

        const pub = await api.publish({ type: 'post', id: e.id });

        const [row] = await entryRepository.findEntryRowsByType('post');
        expect(row?.updatedAt).toEqual(later);
        expect(pub.updatedAt).toEqual(later);
    });

    it('re-publishing a published entry keeps its publishedAt', async () => {
        const e = await api.create({
            type: 'post',
            data: { title: 'P', status: 'published' },
        });
        const again = await api.publish({ type: 'post', id: e.id });
        expect(again.publishedAt?.getTime()).toBe(e.publishedAt?.getTime());
    });

    it('keeps a published entry’s future publishedAt through a save that sends published', async () => {
        const future = new Date(Date.now() + 86_400_000);
        const e = await api.create({
            type: 'post',
            data: { title: 'P', status: 'published', publishedAt: future },
        });
        const saved = await api.update({
            type: 'post',
            id: e.id,
            data: { status: 'published', fields: { body: 'new' } },
        });
        expect(saved.fields['body']).toBe('new');
        expect(saved.publishedAt?.getTime()).toBe(future.getTime());
    });

    it('publishing a scheduled entry puts it live now', async () => {
        const e = await api.create({ type: 'post', data: { title: 'S' } });
        await api.schedule({
            type: 'post',
            id: e.id,
            publishedAt: new Date(Date.now() + 86_400_000),
        });
        const before = Date.now();
        const pub = await api.publish({ type: 'post', id: e.id });
        expect(pub.status).toBe('published');
        expect(pub.publishedAt?.getTime()).toBeGreaterThanOrEqual(before);
        expect(pub.publishedAt?.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('an update to unpublished clears publishedAt, as unpublish does', async () => {
        const e = await api.create({
            type: 'post',
            data: { title: 'P', status: 'published' },
        });
        const un = await api.update({
            type: 'post',
            id: e.id,
            data: { status: 'unpublished' },
        });
        expect(un.publishedAt).toBeNull();
    });

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

        const trashed = await api.query({ type: 'post', full: true, trashed: true });
        expect(trashed.data.map((x) => x.id)).toEqual([e.id]);
        expect(trashed.data[0]?.deletedAt).toBeInstanceOf(Date);

        const restored = await api.restore({ type: 'post', id: e.id });
        expect(restored.deletedAt).toBeNull();
        // A restore unpublishes, so the entry is back but not live.
        expect(restored.status).toBe('unpublished');
        expect(restored.publishedAt).toBeNull();
        const live = await api.query({ type: 'post' });
        expect(live.data.map((x) => x.id)).not.toContain(e.id);
    });

    it("gives a new entry a trashed entry's slug", async () => {
        const first = await api.create({ type: 'post', data: { title: 'Same' } });
        await api.trash({ type: 'post', id: first.id });

        const second = await api.create({ type: 'post', data: { title: 'Same' } });

        expect(second.slug).toBe('same');
    });

    it('re-slugs each locale whose slug was taken while the entry was in the trash', async () => {
        const first = await api.create({
            type: 'post',
            data: { title: 'Same', locale: 'en', status: 'published' },
        });
        await api.update({
            type: 'post',
            id: first.id,
            locale: 'de',
            data: { title: 'Same' },
        });
        await api.trash({ type: 'post', id: first.id });
        const second = await api.create({
            type: 'post',
            data: { title: 'Same', locale: 'en' },
        });

        const restored = await api.restore({ type: 'post', id: first.id });

        expect(restored.slug).toBe('same-2');
        expect(restored.status).toBe('unpublished');
        const de = await api.get({
            type: 'post',
            id: first.id,
            locale: 'de',
            full: true,
        });
        expect(de?.slug).toBe('same');
        const kept = await api.get({ type: 'post', id: second.id, full: true });
        expect(kept?.slug).toBe('same');
    });

    it('gives each entry of a restored batch its own slug', async () => {
        const first = await api.create({ type: 'post', data: { title: 'Same' } });
        await api.trash({ type: 'post', id: first.id });
        const second = await api.create({ type: 'post', data: { title: 'Same' } });
        await api.trash({ type: 'post', id: second.id });

        const restored = await api.restore({ type: 'post', ids: [first.id, second.id] });

        expect(restored.map((entry) => entry.slug)).toEqual(['same', 'same-2']);
    });

    it('leaves an entry that is not in the trash as it is', async () => {
        const e = await api.create({
            type: 'post',
            data: { title: 'Live', status: 'published' },
        });

        const restored = await api.restore({ type: 'post', id: e.id });

        expect(restored.status).toBe('published');
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

        const trashed = await api.query({ type: 'post', full: true, trashed: true });
        expect(trashed.data).toEqual([]);
        const live = await api.query({ type: 'post', full: true });
        expect(live.data.map((x) => x.id)).toEqual([b.id]);
        // Raw: every read joins content, so none would see a bare `entries` row.
        const rows = await getDb()
            .selectFrom('entries')
            .select('id')
            .where('id', '=', a.id)
            .execute();
        expect(rows).toEqual([]);
    });
});

describe('the trash is read-only', () => {
    /** The one trashed `post`, as the trash list reads it back. */
    async function readTrashed(): Promise<Entry | undefined> {
        const trashed = await api.query({ type: 'post', full: true, trashed: true });
        return trashed.data[0];
    }

    /** A probe whose `entry:beforeUpdate` runs `act` once, between the read and the write. */
    function onceBeforeUpdate(act: (id: string) => Promise<unknown>): PluginDefinition {
        let done = false;
        return {
            package: '@test/probe',
            hooks: [
                defineHook('entry:beforeUpdate', async (ctx) => {
                    if (done) return;
                    done = true;
                    await act(ctx.entry.id);
                }),
            ],
        };
    }

    it.each([
        {
            write: 'update',
            call: (id: string) => api.update({ type: 'post', id, data: { title: 'B' } }),
        },
        { write: 'publish', call: (id: string) => api.publish({ type: 'post', id }) },
        { write: 'unpublish', call: (id: string) => api.unpublish({ type: 'post', id }) },
        {
            write: 'schedule',
            call: (id: string) =>
                api.schedule({
                    type: 'post',
                    id,
                    publishedAt: new Date(Date.now() + 60_000),
                }),
        },
        {
            write: 'add a locale to',
            call: (id: string) =>
                api.update({ type: 'post', id, locale: 'de', data: { title: 'B' } }),
        },
    ])('refuses to $write a trashed entry', async ({ call }) => {
        const entry = await api.create({
            type: 'post',
            data: { title: 'A', status: 'published' },
        });
        await api.trash({ type: 'post', id: entry.id });

        const refused = await call(entry.id).catch((err: unknown) => err);

        expect(refused).toBeInstanceOf(ResourceConflictError);
        expect(refused).toMatchObject({
            status: 409,
            code: 'CONFLICT',
            details: { reason: 'trashed' },
        });
        expect(await readTrashed()).toMatchObject({
            title: 'A',
            status: 'published',
            locales: ['en'],
        });
    });

    it('refuses an update when the entry is trashed between the read and the write', async () => {
        const resolved = setupTestConfig();
        registerTestPlugins(
            [onceBeforeUpdate((id) => api.trash({ type: 'post', id }))],
            resolved
        );
        const entry = await api.create({ type: 'post', data: { title: 'A' } });

        const refused = api.update({ type: 'post', id: entry.id, data: { title: 'B' } });

        await expect(refused).rejects.toBeInstanceOf(ResourceConflictError);
        await expect(refused).rejects.toMatchObject({ details: { reason: 'trashed' } });
        expect(await readTrashed()).toMatchObject({ id: entry.id, title: 'A' });
    });

    it('names the trash when the entry is out of it again by the time the refusal is explained', async () => {
        const resolved = setupTestConfig();
        registerTestPlugins(
            [onceBeforeUpdate((id) => api.trash({ type: 'post', id }))],
            resolved
        );
        const entry = await api.create({ type: 'post', data: { title: 'A' } });
        // A row restored between the refused write and the read that explains it.
        vi.spyOn(entryRepository, 'explainConflict').mockResolvedValueOnce(null);

        const refused = api.update({ type: 'post', id: entry.id, data: { title: 'B' } });

        await expect(refused).rejects.toMatchObject({ details: { reason: 'trashed' } });
        expect(await readTrashed()).toMatchObject({ id: entry.id, title: 'A' });
    });

    // `note` keeps no versions: a versioned type snapshots before the guarded
    // write, so the snapshot meets the deleted row first.
    it('answers 404 for an entry deleted between the read and the write', async () => {
        const resolved = setupTestConfig();
        registerTestPlugins(
            [onceBeforeUpdate((id) => api.delete({ type: 'note', id }))],
            resolved
        );
        const entry = await api.create({ type: 'note', data: { title: 'A' } });

        const refused = api.update({ type: 'note', id: entry.id, data: { title: 'B' } });

        await expect(refused).rejects.toBeInstanceOf(ResourceNotFoundError);
        expect(await api.get({ type: 'note', id: entry.id, full: true })).toBeNull();
    });

    it('refuses the same update on a driver with no transactions', async () => {
        const base = await createTestDb();
        const resolved = setupTestConfig({
            ...makeTestConfig(),
            db: { type: 'no-tx', getInstance: () => base, supportsTransactions: false },
        });
        registerTestPlugins(
            [onceBeforeUpdate((id) => api.trash({ type: 'post', id }))],
            resolved
        );
        const entry = await api.create({ type: 'post', data: { title: 'A' } });

        const refused = api.update({ type: 'post', id: entry.id, data: { title: 'B' } });

        await expect(refused).rejects.toMatchObject({ details: { reason: 'trashed' } });
        expect(await readTrashed()).toMatchObject({ id: entry.id, title: 'A' });
    });

    it('refuses a restore whose entry left the trash after the restore read it', async () => {
        const resolved = setupTestConfig();
        // The competing call restores and republishes, which the outer
        // restore's unpublish must not undo.
        registerTestPlugins(
            [
                onceBeforeUpdate(async (id) => {
                    await api.restore({ type: 'post', id });
                    await api.publish({ type: 'post', id });
                }),
            ],
            resolved
        );
        const entry = await api.create({
            type: 'post',
            data: { title: 'A', status: 'published' },
        });
        await api.trash({ type: 'post', id: entry.id });

        const refused = api.restore({ type: 'post', id: entry.id });

        await expect(refused).rejects.toBeInstanceOf(ResourceConflictError);
        await expect(refused).rejects.toMatchObject({
            details: { reason: 'not-trashed' },
        });
        const live = await api.get({ type: 'post', id: entry.id, full: true });
        expect(live).toMatchObject({ status: 'published', deletedAt: null });
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

describe('an entry addressed as another type', () => {
    let noteId: string;

    beforeEach(async () => {
        // The staging and preview token methods need staging on the type they address.
        const config = makeTestConfig();
        if (config.entries['post']) config.entries['post'].staging = true;
        setupTestConfig(config);

        const note = await api.create({
            type: 'note',
            data: { title: 'Note', fields: { body: 'kept' } },
        });
        noteId = note.id;
    });

    it('get answers null', async () => {
        expect(await api.get({ type: 'post', id: noteId, full: true })).toBeNull();
    });

    it.each<[string, (id: string) => Promise<unknown>]>([
        ['update', (id) => api.update({ type: 'post', id, data: { title: 'Changed' } })],
        ['delete', (id) => api.delete({ type: 'post', id })],
        ['trash', (id) => api.trash({ type: 'post', id })],
        ['restore', (id) => api.restore({ type: 'post', id })],
        ['duplicate', (id) => api.duplicate({ type: 'post', id })],
        ['publish', (id) => api.publish({ type: 'post', id })],
        ['unpublish', (id) => api.unpublish({ type: 'post', id })],
        [
            'schedule',
            (id) =>
                api.schedule({
                    type: 'post',
                    id,
                    publishedAt: new Date(Date.now() + 60_000),
                }),
        ],
        ['versions', (id) => api.versions({ type: 'post', id })],
        ['getVersion', (id) => api.getVersion({ type: 'post', id, version: 1 })],
        ['restoreVersion', (id) => api.restoreVersion({ type: 'post', id, version: 1 })],
        ['createStaged', (id) => api.createStaged({ type: 'post', id })],
        ['getStaged', (id) => api.getStaged({ type: 'post', id })],
        ['mergeStaged', (id) => api.mergeStaged({ type: 'post', id })],
        ['deleteStaged', (id) => api.deleteStaged({ type: 'post', id })],
        ['issuePreviewToken', (id) => api.issuePreviewToken({ type: 'post', id })],
        ['revokePreviewToken', (id) => api.revokePreviewToken({ type: 'post', id })],
        ['usedBy', (id) => api.usedBy({ type: 'post', id })],
    ])('%s rejects with ResourceNotFoundError', async (_name, call) => {
        const before = await api.get({ type: 'note', id: noteId, full: true });

        await expect(call(noteId)).rejects.toBeInstanceOf(ResourceNotFoundError);

        expect(await api.get({ type: 'note', id: noteId, full: true })).toEqual(before);
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

    it('trashes, restores and deletes a copy that has no default-locale row', async () => {
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
        const deOnly = await api.duplicate({
            type: 'post',
            id: src.id,
            overrides: { locale: 'de' },
        });

        await api.trash({ type: 'post', id: deOnly.id });
        const restored = await api.restore({ type: 'post', id: deOnly.id });
        expect(restored.id).toBe(deOnly.id);
        expect(restored.locale).toBe('de');
        expect(restored.deletedAt).toBeNull();

        await api.delete({ type: 'post', id: deOnly.id });
        expect(
            await api.get({ type: 'post', id: deOnly.id, locale: 'de', full: true })
        ).toBeNull();
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

        const incoming = await api.usedBy({ type: 'post', id: target.id });
        expect(incoming.map((row) => row.sourceId).sort()).toEqual(
            [src.id, dup.id].sort()
        );
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
        // Read from the target's side, so the target id and kind are the address.
        const incoming = await api.usedBy({ type: 'post', id: target.id });
        expect(incoming).toHaveLength(1);
        expect(incoming[0]?.sourceId).toBe(src.id);
        expect(incoming[0]?.schemaPath).toBe('related');
        expect(incoming[0]?.instancePath).toBe('related');
        expect(incoming[0]?.sourceKind).toBe('entry');
        expect(incoming[0]?.sourceType).toBe('post');
    });

    // The old subsystem skipped falsy values, so clearing a relation left its
    // row behind. A write replaces every reference the source holds.
    it('drops the index row when the relation is cleared', async () => {
        const target = await api.create({ type: 'post', data: { title: 'Target' } });
        const src = await api.create({
            type: 'post',
            data: { title: 'Source', fields: { related: [target.id] } },
        });
        await api.update({ type: 'post', id: src.id, data: { fields: { related: [] } } });

        expect(await api.usedBy({ type: 'post', id: target.id })).toEqual([]);
    });

    it('usedBy lists the source with its title', async () => {
        const target = await api.create({ type: 'post', data: { title: 'Target' } });
        const src = await api.create({
            type: 'post',
            data: { title: 'Source', fields: { related: [target.id] } },
        });
        const incoming = await api.usedBy({ type: 'post', id: target.id });
        expect(incoming).toEqual([
            {
                sourceId: src.id,
                sourceKind: 'entry',
                sourceTitle: 'Source',
                sourceType: 'post',
                schemaPath: 'related',
                instancePath: 'related',
                sourceStaged: false,
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
            ids: [a.id, b.id],
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
                ids: [a.id, 'missing-id', b.id],
                data: { title: 'X' },
            })
        ).rejects.toThrow(/missing-id/);

        const aAfter = await api.get({ type: 'post', id: a.id, full: true });
        const bAfter = await api.get({ type: 'post', id: b.id, full: true });
        expect(aAfter?.title).not.toBe('X');
        expect(bAfter?.title).not.toBe('X');
    });

    it('refuses an empty id list, which the method’s schema declares non-empty', async () => {
        await expect(
            api.update({ type: 'post', ids: [], data: { title: 'X' } })
        ).rejects.toBeInstanceOf(ValidationError);
    });

    it('refuses a call naming both `id` and `ids`, or neither', async () => {
        const a = await api.create({ type: 'post', data: { title: 'A' } });
        await expect(
            api.update({ type: 'post', id: a.id, ids: [a.id], data: { title: 'X' } })
        ).rejects.toBeInstanceOf(ValidationError);
        await expect(
            api.update({ type: 'post', data: { title: 'X' } })
        ).rejects.toBeInstanceOf(ValidationError);
    });
});

// A single id is a batch of one, and the `BulkOperationError` envelope the
// write loop adds names nothing the caller does not know, so each single-id
// verb hands back the underlying error: here the database's own, raised by a
// trigger on the `entries` row the verb writes.
describe('a single id rethrows the underlying error, unwrapped', () => {
    type Verb = {
        verb: string;
        operation: 'update' | 'delete';
        /** The entry's state before the call: `published` or `trashed`, if any. */
        before?: 'published' | 'trashed';
        call(id: string): Promise<unknown>;
    };

    const VERBS: Verb[] = [
        {
            verb: 'update',
            operation: 'update',
            call: (id) => api.update({ type: 'post', id, data: { title: 'B' } }),
        },
        {
            verb: 'publish',
            operation: 'update',
            call: (id) => api.publish({ type: 'post', id }),
        },
        {
            verb: 'unpublish',
            operation: 'update',
            before: 'published',
            call: (id) => api.unpublish({ type: 'post', id }),
        },
        {
            verb: 'schedule',
            operation: 'update',
            call: (id) =>
                api.schedule({
                    type: 'post',
                    id,
                    publishedAt: new Date(Date.now() + 60_000),
                }),
        },
        {
            verb: 'trash',
            operation: 'update',
            call: (id) => api.trash({ type: 'post', id }),
        },
        {
            verb: 'restore',
            operation: 'update',
            before: 'trashed',
            call: (id) => api.restore({ type: 'post', id }),
        },
        {
            verb: 'delete',
            operation: 'delete',
            call: (id) => api.delete({ type: 'post', id }),
        },
    ];

    it.each(VERBS)('$verb', async ({ operation, before, call }) => {
        const entry = await api.create({
            type: 'post',
            data: {
                title: 'A',
                ...(before === 'published' ? { status: 'published' } : {}),
            },
        });
        if (before === 'trashed') await api.trash({ type: 'post', id: entry.id });
        await failWritesTo(entriesTable, operation);

        const refused = call(entry.id);

        await expect(refused).rejects.toBeInstanceOf(LibsqlError);
        await expect(refused).rejects.toThrow('boom');
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

    it('fires the update hooks when a restore unpublishes', async () => {
        const seen: unknown[] = [];
        const resolved = setupTestConfig();
        const probe: PluginDefinition = {
            package: '@test/probe',
            hooks: [
                defineHook('entry:afterUpdate', (ctx) => {
                    seen.push(ctx.data);
                }),
            ],
        };
        registerTestPlugins([probe], resolved);
        const e = await api.create({
            type: 'post',
            data: { title: 'Hooked', status: 'published' },
        });
        await api.trash({ type: 'post', id: e.id });

        await api.restore({ type: 'post', id: e.id });

        expect(seen).toEqual([{ status: 'unpublished' }]);
    });

    it('fires one beforeCreate/afterCreate pair for a duplicate, with the first locale', async () => {
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
        const before: { locale: string; title: string }[] = [];
        const after: { id: string; locale: string; locales: string[] }[] = [];
        const resolved = setupTestConfig();
        registerTestPlugins(
            [
                {
                    package: '@test/probe',
                    hooks: [
                        defineHook('entry:beforeCreate', (ctx) => {
                            before.push({
                                locale: ctx.data.locale,
                                title: ctx.data.title,
                            });
                        }),
                        defineHook('entry:afterCreate', (ctx) => {
                            after.push({
                                id: ctx.entry.id,
                                locale: ctx.entry.locale,
                                locales: ctx.entry.locales,
                            });
                        }),
                    ],
                },
            ],
            resolved
        );

        const dup = await api.duplicate({ type: 'post', id: src.id });

        expect(dup.locale).toBe('en');
        expect(before).toEqual([{ locale: 'en', title: 'EN' }]);
        expect(after).toEqual([{ id: dup.id, locale: 'en', locales: ['de', 'en'] }]);
    });

    it('a throwing beforeCreate aborts a duplicate before any row is written', async () => {
        const src = await api.create({ type: 'post', data: { title: 'Source' } });
        const resolved = setupTestConfig();
        registerTestPlugins(
            [
                {
                    package: '@test/probe',
                    hooks: [
                        defineHook('entry:beforeCreate', () => {
                            throw new Error('blocked');
                        }),
                    ],
                },
            ],
            resolved
        );

        await expect(api.duplicate({ type: 'post', id: src.id })).rejects.toThrow(
            'blocked'
        );
        const rows = await getDb().selectFrom('entries').selectAll().execute();
        expect(rows).toHaveLength(1);
    });

    it('hands the update hooks the public entry, without the content row id', async () => {
        const entry = await api.create({ type: 'post', data: { title: 'Before' } });
        const seen: Entry[] = [];
        const resolved = setupTestConfig();
        const probe: PluginDefinition = {
            package: '@test/probe',
            hooks: [
                defineHook('entry:beforeUpdate', (ctx) => {
                    seen.push(ctx.entry);
                }),
                defineHook('entry:afterUpdate', (ctx) => {
                    seen.push(ctx.entry);
                }),
                defineHook('entry:beforeDelete', (ctx) => {
                    seen.push(ctx.entry);
                }),
            ],
        };
        registerTestPlugins([probe], resolved);

        await api.update({ type: 'post', id: entry.id, data: { title: 'After' } });
        await api.trash({ type: 'post', id: entry.id });

        expect(seen).toHaveLength(3);
        for (const payload of seen) {
            expect(payload.id).toBe(entry.id);
            expect(payload).not.toHaveProperty('contentId');
        }
    });

    it('fails as the hook’s error when beforeUpdate leaves data its schema refuses', async () => {
        const entry = await api.create({ type: 'post', data: { title: 'Before' } });
        expectConsole('error', 'entry:beforeUpdate returned data that fails its schema');
        const resolved = setupTestConfig();
        registerTestPlugins(
            [
                {
                    package: '@test/probe',
                    hooks: [
                        defineHook('entry:beforeUpdate', (ctx) => {
                            (ctx.data as Record<string, unknown>)['extra'] = true;
                        }),
                    ],
                },
            ],
            resolved
        );

        const update = api.update({
            type: 'post',
            id: entry.id,
            data: { title: 'After' },
        });

        await expect(update).rejects.toThrow(HookOutputValidationError);
        await expect(update).rejects.toThrow(
            'entry:beforeUpdate returned data that fails its schema'
        );
        expect((await api.get({ type: 'post', id: entry.id, full: true }))?.title).toBe(
            'Before'
        );
    });

    it('answers the caller’s empty title on a titled type with a 422 before any hook runs', async () => {
        const entry = await api.create({ type: 'post', data: { title: 'Before' } });
        const seen: unknown[] = [];
        const resolved = setupTestConfig();
        registerTestPlugins(
            [
                {
                    package: '@test/probe',
                    hooks: [
                        defineHook('entry:beforeUpdate', (ctx) => void seen.push(ctx)),
                    ],
                },
            ],
            resolved
        );

        await expect(
            api.update({ type: 'post', id: entry.id, data: { title: '' } })
        ).rejects.toThrow(ValidationError);
        expect(seen).toEqual([]);
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

    // A throw from an after* handler propagates rather than being logged, and
    // the write it followed stays committed (see `DECISIONS.md`).
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
