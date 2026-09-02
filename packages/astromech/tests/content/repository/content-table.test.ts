/**
 * Tests for the shared content repository, exercised through the globals
 * shape — the second consumer of `createContentRepository`, and the one that
 * declares no slug, no trash and no owner filter. What it proves is that the
 * generic half is genuinely generic: the entries suite covers the same
 * machinery with entries' own columns bolted on.
 */

import type { ContentRowId } from '@/content/repository/types';
import type { Db } from '@/database/types';
import type { JsonObject } from '@/types/index';
import { createTestDb, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { createGlobalsRepository } from '@/globals/repository/globals-table';

let db: Db;
let repository: ReturnType<typeof createGlobalsRepository>;

beforeEach(async () => {
    db = await createTestDb();
    setupTestConfig();
    repository = createGlobalsRepository();
});

async function createSite(fields: JsonObject = { title: 'Site' }) {
    return repository.create({ key: 'site' }, { fields });
}

describe('create', () => {
    it('writes a resource row and its first content row', async () => {
        const created = await createSite();

        expect(created.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/); // ULID
        expect(created.key).toBe('site');
        expect(created.locale).toBe('en');
        expect(created.locales).toEqual(['en']);
        expect(created.staged).toBe(false);
        expect(created.status).toBe('unpublished');
        expect(created.fields).toEqual({ title: 'Site' });

        const rows = await db
            .selectFrom('globalContent')
            .selectAll()
            .where('globalId', '=', created.id)
            .execute();
        expect(rows).toHaveLength(1);
        // The public id is the resource id; the content row carries its own.
        expect(rows[0]?.id).not.toBe(created.id);
        expect(created.contentId).toBe(rows[0]?.id);
    });

    it('resolves the row id from the key', async () => {
        const created = await createSite();
        expect(await repository.idByKey('site')).toBe(created.id);
        expect(await repository.idByKey('missing')).toBeNull();
    });
});

describe('get', () => {
    it('reads one locale and does not fall back to another', async () => {
        const created = await createSite();

        expect((await repository.get({ id: created.id }))?.fields).toEqual({
            title: 'Site',
        });
        expect(await repository.get({ id: created.id, locale: 'de' })).toBeNull();
        expect(await repository.get({ id: 'nope' })).toBeNull();
    });

    it('anyLocale prefers the default locale, else the first alphabetically', async () => {
        const created = await createSite();
        expect((await repository.anyLocale(created.id))?.locale).toBe('en');

        const other = await repository.create({ key: 'footer' }, { locale: 'de' });
        expect((await repository.anyLocale(other.id))?.locale).toBe('de');
    });
});

describe('update', () => {
    it('patches the named locale and leaves omitted columns alone', async () => {
        const created = await createSite();
        const updated = await repository.update(
            { id: created.id },
            { fields: { title: 'Changed' } }
        );

        expect(updated.fields).toEqual({ title: 'Changed' });
        expect(updated.status).toBe('unpublished');
        expect(updated.locales).toEqual(['en']);
    });

    it('creates the content row when that locale has none', async () => {
        const created = await createSite();
        const de = await repository.update(
            { id: created.id, locale: 'de' },
            { fields: { title: 'Seite' } }
        );

        expect(de.id).toBe(created.id);
        expect(de.locale).toBe('de');
        expect(de.fields).toEqual({ title: 'Seite' });
        expect(de.locales).toEqual(['de', 'en']);
        expect(de.contentId).not.toBe(created.contentId);
    });

    it('throws when the resource row is gone', async () => {
        await expect(repository.update({ id: 'nope' }, {})).rejects.toThrow(/not found/);
    });
});

describe('locales', () => {
    it('groups the canonical locales of each id, sorted', async () => {
        const site = await createSite();
        await repository.update({ id: site.id, locale: 'de' }, {});
        const footer = await repository.create({ key: 'footer' }, {});

        expect(await repository.locales([site.id, footer.id])).toEqual(
            new Map([
                [site.id, ['de', 'en']],
                [footer.id, ['en']],
            ])
        );
        expect(await repository.locales([])).toEqual(new Map());
    });
});

describe('translatable', () => {
    it('lists the other canonical locales', async () => {
        const site = await createSite();
        await repository.update({ id: site.id, locale: 'de' }, { fields: { a: 1 } });

        const siblings = await repository.translatable.siblings(site.id, 'en');
        expect(siblings.map((row) => row.locale)).toEqual(['de']);
        expect(await repository.translatable.siblings(site.id)).toHaveLength(2);
    });

    it('merges shared values into every other locale', async () => {
        const site = await createSite({ title: 'Site', shared: 'old' });
        await repository.update(
            { id: site.id, locale: 'de' },
            { fields: { title: 'Seite', shared: 'old' } }
        );

        await repository.translatable.propagateFields(site.id, 'en', { shared: 'new' });

        expect((await repository.get({ id: site.id, locale: 'de' }))?.fields).toEqual({
            title: 'Seite',
            shared: 'new',
        });
        // The excluded locale is untouched.
        expect((await repository.get({ id: site.id }))?.fields).toEqual({
            title: 'Site',
            shared: 'old',
        });
    });
});

describe('staging', () => {
    it('adds a second content row for the same locale', async () => {
        const site = await createSite();
        const staged = await repository.staging.create(
            { id: site.id },
            { fields: { title: 'Draft' } }
        );

        expect(staged.staged).toBe(true);
        expect(staged.id).toBe(site.id);
        expect(staged.contentId).not.toBe(site.contentId);
        // The partial unique index covers canonical rows only, so the staged
        // row shares `(globalId, locale)` with its canonical without colliding.
        const rows = await db
            .selectFrom('globalContent')
            .selectAll()
            .where('globalId', '=', site.id)
            .execute();
        expect(rows).toHaveLength(2);
        expect(rows.filter((row) => row.stagedFor !== null)).toHaveLength(1);

        // And it stays out of the canonical read and the locale list.
        expect((await repository.get({ id: site.id }))?.fields).toEqual({
            title: 'Site',
        });
        expect(staged.locales).toEqual(['en']);
    });

    it('reads, writes and discards the staged row', async () => {
        const site = await createSite();
        await repository.staging.create({ id: site.id }, { fields: { title: 'Draft' } });

        expect((await repository.staging.getByCanonical(site.id))?.fields).toEqual({
            title: 'Draft',
        });

        const updated = await repository.staging.update(
            { id: site.id },
            { fields: { title: 'Draft 2' } }
        );
        expect(updated.fields).toEqual({ title: 'Draft 2' });

        await repository.staging.delete({ id: site.id });
        expect(await repository.staging.getByCanonical(site.id)).toBeNull();
        expect(await repository.get({ id: site.id })).not.toBeNull();
    });

    it('refuses to write a staged row that does not exist', async () => {
        const site = await createSite();
        await expect(repository.staging.update({ id: site.id }, {})).rejects.toThrow(
            /No staged change/
        );
    });

    it('rejects a second canonical row for one locale', async () => {
        const site = await createSite();
        await expect(
            db
                .insertInto('globalContent')
                .values({
                    id: '01JQZ0000000000000000GLOB',
                    globalId: site.id,
                    locale: 'en',
                    status: 'unpublished',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                })
                .execute()
        ).rejects.toThrow(/UNIQUE constraint failed/);
    });
});

describe('versions', () => {
    it('numbers, lists and cascades snapshots per content row', async () => {
        const site = await createSite();
        const de = await repository.update({ id: site.id, locale: 'de' }, {});

        expect(await repository.versions.latestNumber(site.contentId)).toBe(0);

        for (const [contentId, version, title] of [
            [site.contentId, 1, 'EN v1'],
            [de.contentId, 1, 'DE v1'],
            [de.contentId, 2, 'DE v2'],
        ] as [ContentRowId, number, string][]) {
            await repository.versions.create({
                contentId,
                version,
                fields: { title },
                createdBy: null,
            });
        }

        expect(await repository.versions.latestNumber(de.contentId)).toBe(2);
        expect(
            (await repository.versions.list(de.contentId)).map((row) => row.version)
        ).toEqual([2, 1]);
        expect(await repository.versions.list(site.contentId)).toHaveLength(1);

        const [first] = await repository.versions.list(site.contentId);
        expect((await repository.versions.get(first!.id))?.fields).toEqual({
            title: 'EN v1',
        });
        expect(await repository.versions.get('nope')).toBeNull();

        await repository.delete(site.id);
        expect(await db.selectFrom('globalVersions').selectAll().execute()).toEqual([]);
        expect(await db.selectFrom('globalContent').selectAll().execute()).toEqual([]);
    });
});
