/**
 * The single-entry half of `routes/entries.ts`: list, get, create, update,
 * duplicate, restore, and the three delete routes.
 *
 * Asserts the status, the envelope and the keys each handler returns, plus the
 * capability 409s and the per-type body schemas — the facts a table-driven
 * handler has to reproduce exactly.
 */

import type { AstromechConfig, Entry } from '@/types/index';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { adminRole, mountRouter, seedTestUser } from '@tests/mount-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { entriesService as api } from '@/entries/service';
import { createEntriesRouter } from '@/transport/http/routes/entries';

function app() {
    return mountRouter('/entries', createEntriesRouter(), adminRole);
}

/** `makeTestConfig` with trash switched off for `note`. */
function configWithoutTrash(): AstromechConfig {
    const config = makeTestConfig();
    if (config.entries['note']) config.entries['note'].trash = false;
    return config;
}

beforeEach(async () => {
    const db = await createTestDb();
    await seedTestUser(db);
    setupTestConfig(makeTestConfig());
});

describe('GET /entries/:type', () => {
    it('returns { data, pagination } straight from the service', async () => {
        await api.create({ type: 'post', data: { title: 'One', status: 'published' } });

        const res = await app().request('/entries/post');
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
            data: Entry[];
            pagination: { page: number; limit: number; total: number; pages: number };
        };
        expect(Object.keys(body).sort()).toEqual(['data', 'pagination']);
        expect(body.data.map((e) => e.title)).toEqual(['One']);
        expect(Object.keys(body.pagination).sort()).toEqual([
            'limit',
            'page',
            'pages',
            'total',
        ]);
    });

    it('404s an unknown type', async () => {
        const res = await app().request('/entries/nope');
        expect(res.status).toBe(404);
        const body = (await res.json()) as { error: { code: string; message: string } };
        expect(body.error.code).toBe('NOT_FOUND');
        expect(body.error.message).toBe("Entry type 'nope' not found");
    });
});

describe('GET /entries/:type/:id', () => {
    it('returns { data: entry } with the entry’s own keys', async () => {
        const created = await api.create({
            type: 'post',
            data: {
                title: 'Read me',
                slug: 'read-me',
                fields: { body: 'hi' },
                status: 'published',
            },
        });

        const res = await app().request(`/entries/post/${created.id}`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: Entry };
        expect(Object.keys(body)).toEqual(['data']);
        expect(body.data.id).toBe(created.id);
        expect(body.data.title).toBe('Read me');
        expect(body.data.slug).toBe('read-me');
        expect(body.data.type).toBe('post');
        expect(body.data.status).toBe('published');
    });

    it('404s an unknown id', async () => {
        const res = await app().request('/entries/post/nope');
        expect(res.status).toBe(404);
        const body = (await res.json()) as { error: { message: string } };
        expect(body.error.message).toBe("Entry 'nope' not found");
    });

    it('422s `staged` without a preview token, rather than answering the canonical', async () => {
        const created = await api.create({
            type: 'post',
            data: { title: 'Live', slug: 'live', status: 'published' },
        });

        const res = await app().request(`/entries/post/${created.id}?staged=true`);
        expect(res.status).toBe(422);
        const body = (await res.json()) as { error: { details: { form: string[] } } };
        expect(body.error.details.form[0]).toContain('previewToken');
    });

    it('404s an unknown type before the id is looked at', async () => {
        const res = await app().request('/entries/nope/anything');
        expect(res.status).toBe(404);
        expect(((await res.json()) as { error: { message: string } }).error.message).toBe(
            "Entry type 'nope' not found"
        );
    });
});

describe('POST /entries/:type', () => {
    it('creates and returns { data: entry } with 201', async () => {
        const res = await app().request('/entries/post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: 'Made',
                slug: 'made',
                fields: { body: 'text' },
                status: 'published',
            }),
        });
        expect(res.status).toBe(201);
        const body = (await res.json()) as { data: Entry };
        expect(Object.keys(body)).toEqual(['data']);
        expect(body.data.title).toBe('Made');
        expect(body.data.slug).toBe('made');
        expect(body.data.fields).toEqual({ body: 'text' });
        expect(body.data.status).toBe('published');
    });

    it('400s a titled type with no title, in OpenAPIHono’s validator envelope', async () => {
        const res = await app().request('/entries/post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: {} }),
        });
        expect(res.status).toBe(400);
        const body = (await res.json()) as { success: boolean; error: unknown };
        expect(body.success).toBe(false);
        expect(body.error).toBeDefined();
    });

    it('admits a titleless type with no title', async () => {
        const res = await app().request('/entries/snippet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: { key: 'k', value: 'v' } }),
        });
        expect(res.status).toBe(201);
        expect(((await res.json()) as { data: Entry }).data.title).toBe('');
    });

    it('409s a status on a type without the statuses capability', async () => {
        const res = await app().request('/entries/snippet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'published' }),
        });
        expect(res.status).toBe(409);
        const body = (await res.json()) as { error: { code: string; message: string } };
        expect(body.error.code).toBe('capability_not_supported');
        expect(body.error.message).toContain('statuses');
    });

    it('409s a slug on a type without the slug capability', async () => {
        const res = await app().request('/entries/snippet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug: 'nope' }),
        });
        expect(res.status).toBe(409);
        expect(
            ((await res.json()) as { error: { message: string } }).error.message
        ).toContain('slug');
    });

    it('404s an unknown type', async () => {
        const res = await app().request('/entries/nope', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'x' }),
        });
        expect(res.status).toBe(404);
    });
});

describe('PUT /entries/:type/:id', () => {
    it('updates and returns { data: entry }', async () => {
        const created = await api.create({
            type: 'post',
            data: { title: 'Before', slug: 'b' },
        });

        const res = await app().request(`/entries/post/${created.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'After', fields: { body: 'new' } }),
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: Entry };
        expect(Object.keys(body)).toEqual(['data']);
        expect(body.data.title).toBe('After');
        expect(body.data.fields).toEqual({ body: 'new' });
    });

    it('422s an empty title on a titled type', async () => {
        const created = await api.create({
            type: 'post',
            data: { title: 'Before', slug: 'b2' },
        });
        const res = await app().request(`/entries/post/${created.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: '' }),
        });
        expect(res.status).toBe(422);
        const body = (await res.json()) as {
            error: { code: string; details: { fields: Record<string, string[]> } };
        };
        expect(body.error.code).toBe('VALIDATION_FAILED');
        expect(body.error.details.fields['title']).toEqual(['Title cannot be empty']);
    });

    it('409s a status on a type without the statuses capability', async () => {
        const created = await api.create({
            type: 'snippet',
            data: { fields: { key: 'k' } },
        });
        const res = await app().request(`/entries/snippet/${created.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'published' }),
        });
        expect(res.status).toBe(409);
        expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
            'capability_not_supported'
        );
    });
});

describe('POST /entries/:type/:id/duplicate', () => {
    it('copies the entry and returns { data: entry } with 201', async () => {
        const created = await api.create({
            type: 'post',
            data: { title: 'Original', slug: 'original', fields: { body: 'text' } },
        });

        const res = await app().request(`/entries/post/${created.id}/duplicate`, {
            method: 'POST',
        });
        expect(res.status).toBe(201);
        const body = (await res.json()) as { data: Entry };
        expect(body.data.id).not.toBe(created.id);
        expect(body.data.fields).toEqual({ body: 'text' });
    });

    it('applies overrides from the body', async () => {
        const created = await api.create({
            type: 'post',
            data: { title: 'Original', slug: 'o2' },
        });
        const res = await app().request(`/entries/post/${created.id}/duplicate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Renamed', slug: 'renamed' }),
        });
        expect(res.status).toBe(201);
        const body = (await res.json()) as { data: Entry };
        expect(body.data.title).toBe('Renamed');
        expect(body.data.slug).toBe('renamed');
    });

    it('422s an override that fails the schema', async () => {
        const created = await api.create({
            type: 'post',
            data: { title: 'Original', slug: 'o3' },
        });
        const res = await app().request(`/entries/post/${created.id}/duplicate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug: 'Not A Slug' }),
        });
        expect(res.status).toBe(422);
    });
});

describe('DELETE /entries/:type/:id', () => {
    it('trashes when the type has the trash capability, returning { success: true }', async () => {
        const created = await api.create({
            type: 'post',
            data: { title: 'Bin me', slug: 'bin' },
        });

        const res = await app().request(`/entries/post/${created.id}`, {
            method: 'DELETE',
        });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true });

        const trashed = await api.query({ type: 'post', trashed: true, full: true });
        expect(trashed.data.map((e) => e.id)).toEqual([created.id]);
    });

    it('hard-deletes when the type has no trash capability', async () => {
        setupTestConfig(configWithoutTrash());
        const created = await api.create({
            type: 'note',
            data: { title: 'Gone', slug: 'gone' },
        });

        const res = await app().request(`/entries/note/${created.id}`, {
            method: 'DELETE',
        });
        expect(res.status).toBe(200);
        expect(await api.get({ type: 'note', id: created.id, full: true })).toBeNull();
    });
});

describe('DELETE /entries/:type/:id/force', () => {
    it('hard-deletes regardless of the trash capability', async () => {
        const created = await api.create({
            type: 'post',
            data: { title: 'Force', slug: 'force' },
        });

        const res = await app().request(`/entries/post/${created.id}/force`, {
            method: 'DELETE',
        });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true });
        expect(await api.get({ type: 'post', id: created.id, full: true })).toBeNull();
    });
});

describe('DELETE /entries/:type/trash', () => {
    it('empties the trash and returns { success: true }', async () => {
        const created = await api.create({
            type: 'post',
            data: { title: 'Bin', slug: 'bin2' },
        });
        await api.trash({ type: 'post', id: created.id });

        const res = await app().request('/entries/post/trash', { method: 'DELETE' });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true });

        const trashed = await api.query({ type: 'post', trashed: true, full: true });
        expect(trashed.data).toEqual([]);
    });

    it('409s when the type has no trash capability', async () => {
        setupTestConfig(configWithoutTrash());
        const res = await app().request('/entries/note/trash', { method: 'DELETE' });
        expect(res.status).toBe(409);
        expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
            'capability_not_supported'
        );
    });
});

describe('POST /entries/:type/:id/restore', () => {
    it('restores a trashed entry and returns { data: entry }', async () => {
        const created = await api.create({
            type: 'post',
            data: { title: 'Back', slug: 'back' },
        });
        await api.trash({ type: 'post', id: created.id });

        const res = await app().request(`/entries/post/${created.id}/restore`, {
            method: 'POST',
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: Entry };
        expect(Object.keys(body)).toEqual(['data']);
        expect(body.data.id).toBe(created.id);
    });

    it('409s when the type has no trash capability', async () => {
        setupTestConfig(configWithoutTrash());
        const res = await app().request('/entries/note/anything/restore', {
            method: 'POST',
        });
        expect(res.status).toBe(409);
    });
});
