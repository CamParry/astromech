/**
 * `parseQueryParams`, `validateSort` and `SORTABLE_FIELDS` in
 * `routes/entries.ts`, pinned through the router.
 *
 * All three are private to that file and nothing else asserts them, so this is
 * the record of what the query string and the query body are allowed to mean:
 * which keys are read, which are ignored, and which values are coerced.
 */

import type { Entry } from '@/types/index';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { adminRole, mountRouter } from '@tests/mount-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { entriesService as api } from '@/entries/service';
import { createEntriesRouter } from '@/transport/http/routes/entries';

function app() {
    return mountRouter('/entries', createEntriesRouter(), adminRole);
}

type QueryBody = { data: Entry[]; pagination: { page: number; pages: number } | null };

async function get(query: string): Promise<QueryBody> {
    const res = await app().request(`/entries/post${query}`);
    expect(res.status).toBe(200);
    return (await res.json()) as QueryBody;
}

async function queryBody(body: unknown): Promise<Response> {
    return app().request('/entries/post/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

/** Titles in creation order: the default sort is not alphabetical. */
beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeTestConfig());
    for (const title of ['Beta', 'Alpha', 'Gamma']) {
        await api.create({
            type: 'post',
            title,
            slug: title.toLowerCase(),
            status: 'published',
        });
    }
});

describe('parseQueryParams — paging', () => {
    it('reads page and limit as numbers', async () => {
        const body = await get('?page=2&limit=1');
        expect(body.data).toHaveLength(1);
        expect(body.pagination?.page).toBe(2);
        expect(body.pagination?.pages).toBe(3);
    });

    it('reads limit=all as the literal, dropping pagination to null', async () => {
        const body = await get('?limit=all');
        expect(body.data).toHaveLength(3);
        expect(body.pagination).toBeNull();
    });

    it('ignores page and limit when absent', async () => {
        const body = await get('');
        expect(body.pagination?.page).toBe(1);
    });
});

describe('parseQueryParams — search, locale and trashed', () => {
    it('reads search', async () => {
        const body = await get('?search=Alpha');
        expect(body.data.map((e) => e.title)).toEqual(['Alpha']);
    });

    it('ignores an empty search value', async () => {
        expect((await get('?search=')).data).toHaveLength(3);
    });

    it('reads locale', async () => {
        expect((await get('?locale=en')).data).toHaveLength(3);
        expect((await get('?locale=de')).data).toHaveLength(0);
    });

    it('reads trashed only as the exact string "true"', async () => {
        const [first] = (await api.query({ type: 'post', full: true })).data;
        await api.trash({ type: 'post', id: first?.id ?? '' });

        // `trashed=1` is not "true", so it is ignored and the live rows come back.
        expect((await get('?trashed=1&full=true')).data).toHaveLength(2);
        expect((await get('?trashed=true&full=true')).data).toHaveLength(1);
    });
});

describe('parseQueryParams — the staged and previewToken pair', () => {
    it('accepts staged as "true" or "1"', async () => {
        for (const value of ['true', '1']) {
            const res = await app().request(`/entries/post?staged=${value}`);
            expect(res.status).toBe(200);
        }
    });

    it('carries previewToken without a session', async () => {
        const res = await app().request('/entries/post?previewToken=not-a-real-token');
        expect(res.status).toBe(200);
    });
});

describe('SORTABLE_FIELDS on the query string', () => {
    it('sorts on an allowed field, honouring dir=asc', async () => {
        const body = await get('?sort=title&dir=asc');
        expect(body.data.map((e) => e.title)).toEqual(['Alpha', 'Beta', 'Gamma']);
    });

    it('defaults dir to desc when it is absent', async () => {
        expect((await get('?sort=title')).data.map((e) => e.title)).toEqual([
            'Gamma',
            'Beta',
            'Alpha',
        ]);
    });

    it('400s an unrecognised dir — the OpenAPI route schema rejects it before the handler', async () => {
        const res = await app().request('/entries/post?sort=title&dir=sideways');
        expect(res.status).toBe(400);
    });

    it('sorts on every field in the allowlist', async () => {
        for (const field of [
            'title',
            'status',
            'createdAt',
            'updatedAt',
            'publishedAt',
            'slug',
        ]) {
            const res = await app().request(`/entries/post?sort=${field}&dir=asc`);
            expect(res.status).toBe(200);
        }
    });

    it('errors on a field outside the allowlist rather than answering the default order', async () => {
        // The route forwards the field as given; `entries/repository/built-in.ts`
        // holds the allowlist and throws `UnknownSortKeyError` on a miss.
        const unlisted = await app().request('/entries/post?sort=id&dir=asc');
        expect(unlisted.status).toBe(500);
    });
});

describe('validateSort on the query body', () => {
    async function titlesFor(sort: unknown): Promise<string[]> {
        const res = await queryBody(sort === undefined ? {} : { sort });
        expect(res.status).toBe(200);
        return ((await res.json()) as QueryBody).data.map((e) => e.title);
    }

    it('accepts an object of field → direction', async () => {
        expect(await titlesFor({ title: 'asc' })).toEqual(['Alpha', 'Beta', 'Gamma']);
        expect(await titlesFor({ title: 'desc' })).toEqual(['Gamma', 'Beta', 'Alpha']);
    });

    it('accepts an array of them', async () => {
        expect(await titlesFor([{ title: 'asc' }])).toEqual(['Alpha', 'Beta', 'Gamma']);
    });

    it('errors on a key outside the allowlist, even alongside an allowed one', async () => {
        const res = await queryBody({ sort: { id: 'asc', title: 'asc' } });
        expect(res.status).toBe(500);
    });

    it('falls back to the default order for a shape the schema drops', async () => {
        // These parse as neither a sort object nor a list of them, so the
        // schema's `catch` drops them before storage sees a field name. The
        // default is `createdAt desc` and these three rows share a timestamp,
        // so only the SET is deterministic.
        const all = ['Alpha', 'Beta', 'Gamma'];
        for (const sort of [{ title: 'sideways' }, {}, 'title', null, []]) {
            expect((await titlesFor(sort)).sort()).toEqual(all);
        }
    });
});

describe('the full flag', () => {
    it('reads full=true from the query string and full === true from a body', async () => {
        const fromQuery = await app().request('/entries/post?full=true');
        expect(fromQuery.status).toBe(200);

        const fromBody = await queryBody({ full: true });
        expect(fromBody.status).toBe(200);
    });

    it('treats any other query value as not asking for the full shape', async () => {
        const [first] = (await api.query({ type: 'post', full: true })).data;
        await api.trash({ type: 'post', id: first?.id ?? '' });

        // `full=1` is not "true", so the trashed read is refused as a public one.
        const res = await app().request('/entries/post?trashed=true&full=1');
        expect(res.status).toBe(400);
    });
});

describe('cascadeLocales on the delete routes', () => {
    it('is read as "true" or "1", and ignored otherwise', async () => {
        for (const value of ['true', '1', 'yes']) {
            const created = await api.create({
                type: 'post',
                title: `C-${value}`,
                slug: `c-${value}`,
            });
            const res = await app().request(
                `/entries/post/${created.id}/force?cascadeLocales=${value}`,
                { method: 'DELETE' }
            );
            expect(res.status).toBe(200);
            expect(
                await api.get({ type: 'post', id: created.id, full: true })
            ).toBeNull();
        }
    });
});
