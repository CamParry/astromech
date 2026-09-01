/**
 * `locale` as a query param across the entries routes.
 *
 * An entry has one id and one content row per locale, so every content-level
 * route carries the locale on the query string beside the id. These tests own
 * that wiring: which row a read returns, that an update writes the translation
 * a locale has no row for yet, that a preview token reaches every locale, and
 * that a version list is per locale. The service policy behind each is pinned
 * in tests/services/entries/.
 *
 * `de` is the second locale `makeTestConfig` declares; `post` is its only
 * translatable type.
 */

import type { AstromechConfig, Entry, EntryVersion } from '@/types/index';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { adminRole, mountRouter, seedTestUser } from '@tests/mount-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { entriesService as api } from '@/entries/service';
import { createEntriesRouter } from '@/transport/http/routes/entries';

function app() {
    return mountRouter('/entries', createEntriesRouter(), adminRole);
}

/** `makeTestConfig` with `post` staging on, so the preview routes are reachable. */
function configWithStaging(): AstromechConfig {
    const config = makeTestConfig();
    if (config.entries['post']) config.entries['post'].staging = true;
    return config;
}

beforeEach(async () => {
    const db = await createTestDb();
    await seedTestUser(db);
    setupTestConfig(configWithStaging());
});

/**
 * An `en` post and the `de` translation an update writes, both published: an
 * unauthenticated route read answers the public shape, which drops an
 * unpublished row.
 */
async function withTranslation(): Promise<Entry> {
    const created = await api.create({
        type: 'post',
        data: {
            title: 'Hello',
            slug: 'hello',
            fields: { body: 'en body' },
            status: 'published',
        },
    });
    await api.update({
        type: 'post',
        id: created.id,
        locale: 'de',
        data: {
            title: 'Hallo',
            slug: 'hallo',
            fields: { body: 'de body' },
            status: 'published',
        },
    });
    return created;
}

describe('GET /entries/:type/:id?locale=', () => {
    it('returns the row for the locale asked for, under the same id', async () => {
        const created = await withTranslation();

        const res = await app().request(`/entries/post/${created.id}?locale=de`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: Entry };
        expect(body.data.id).toBe(created.id);
        expect(body.data.locale).toBe('de');
        expect(body.data.title).toBe('Hallo');
        expect(body.data.locales).toEqual(['de', 'en']);
    });

    it('defaults to the default content locale', async () => {
        const created = await withTranslation();

        const res = await app().request(`/entries/post/${created.id}`);
        const body = (await res.json()) as { data: Entry };
        expect(body.data.locale).toBe('en');
        expect(body.data.title).toBe('Hello');
    });

    it('404s a locale the entry has no content row for', async () => {
        const created = await api.create({
            type: 'post',
            data: { title: 'Only English', slug: 'only-english', status: 'published' },
        });

        const res = await app().request(`/entries/post/${created.id}?locale=de`);
        expect(res.status).toBe(404);
        const body = (await res.json()) as { error: { code: string; message: string } };
        expect(body.error.code).toBe('NOT_FOUND');
        expect(body.error.message).toBe(`Entry '${created.id}' not found`);
    });
});

describe('PUT /entries/:type/:id?locale=', () => {
    it('creates the translation when the locale has no row yet', async () => {
        const created = await api.create({
            type: 'post',
            data: { title: 'Hello', slug: 'hello', fields: { body: 'en body' } },
        });

        const res = await app().request(`/entries/post/${created.id}?locale=de`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Hallo', slug: 'hallo' }),
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: Entry };
        expect(body.data.id).toBe(created.id);
        expect(body.data.locale).toBe('de');
        expect(body.data.title).toBe('Hallo');

        // The default locale is untouched, and the entry now reports both.
        const en = await api.get({ type: 'post', id: created.id, full: true });
        expect(en?.title).toBe('Hello');
        expect(en?.locales).toEqual(['de', 'en']);
    });

    it('edits the existing row when the locale already has one', async () => {
        const created = await withTranslation();

        const res = await app().request(`/entries/post/${created.id}?locale=de`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Guten Tag' }),
        });
        expect(res.status).toBe(200);
        expect(((await res.json()) as { data: Entry }).data.title).toBe('Guten Tag');
        const de = await api.get({ type: 'post', id: created.id, locale: 'de' });
        expect(de?.slug).toBe('hallo');
    });
});

describe('preview reads across locales', () => {
    it('reads either locale with the one token the entry carries', async () => {
        // Unpublished, so only the token gets a public read past the publish
        // gate — which is what makes the token load-bearing here.
        const created = await api.create({
            type: 'post',
            data: { title: 'Draft', slug: 'draft' },
        });
        await api.update({
            type: 'post',
            id: created.id,
            locale: 'de',
            data: { title: 'Entwurf', slug: 'entwurf' },
        });

        const issued = await app().request(`/entries/post/${created.id}/preview-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        expect(issued.status).toBe(201);
        const { token } = ((await issued.json()) as { data: { token: string } }).data;

        // Without the token the public read sees nothing in either locale.
        expect(
            (await app().request(`/entries/post/${created.id}?locale=de`)).status
        ).toBe(404);

        const de = await app().request(
            `/entries/post/${created.id}?previewToken=${token}&locale=de`
        );
        expect(de.status).toBe(200);
        const deBody = (await de.json()) as { data: Entry };
        expect(deBody.data.locale).toBe('de');
        expect(deBody.data.title).toBe('Entwurf');

        const en = await app().request(
            `/entries/post/${created.id}?previewToken=${token}`
        );
        expect(((await en.json()) as { data: Entry }).data.title).toBe('Draft');
    });
});

describe('GET /entries/:type/:id/versions?locale=', () => {
    it('lists the versions of the locale asked for', async () => {
        const created = await withTranslation();
        await api.update({
            type: 'post',
            id: created.id,
            data: { fields: { body: 'en body v2' } },
        });
        await api.update({
            type: 'post',
            id: created.id,
            locale: 'de',
            data: { fields: { body: 'de body v2' } },
        });

        const de = await app().request(`/entries/post/${created.id}/versions?locale=de`);
        expect(de.status).toBe(200);
        const deVersions = ((await de.json()) as { data: EntryVersion[] }).data;
        expect(deVersions.length).toBeGreaterThan(0);
        expect(deVersions.every((version) => version.locale === 'de')).toBe(true);
        expect(deVersions.every((version) => version.entryId === created.id)).toBe(true);

        const en = await app().request(`/entries/post/${created.id}/versions`);
        const enVersions = ((await en.json()) as { data: EntryVersion[] }).data;
        expect(enVersions.every((version) => version.locale === 'en')).toBe(true);
        expect(enVersions.map((version) => version.title)).not.toContain('Hallo');
    });
});
