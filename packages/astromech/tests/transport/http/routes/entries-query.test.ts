/**
 * Read-shape wiring on the entries router: `trashed` is only meaningful in the
 * full shape, so a public trashed read must answer 400 rather than the catch-all
 * 500 (or, as it did before, a silently empty list — public visibility drops
 * every trashed row after the repository call).
 *
 * Covers all three routes that funnel into `entries.query`: `GET /:type`,
 * `POST /:type/query` and the cross-type `POST /query`.
 *
 * A cross-type query naming a type stored in its own table is a caller bug
 * too, so `POST /query` answers it with 400.
 */

import type { AuthVariables } from '@/transport/http/middleware/auth';
import type { Entry, PluginDefinition, Role, User } from '@/types/index';
import { OpenAPIHono } from '@hono/zod-openapi';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAppContext } from '@/app-context/app-context';
import { entriesService as api } from '@/app-context/services';
import { defineTable } from '@/database/define-table';
import { tableRepository } from '@/entries/repository/table';
import { onError } from '@/transport/http/middleware/errors';
import { createEntriesRouter } from '@/transport/http/routes/entries';

const fakeUser = { id: 'u1', email: 'a@b.dev' } as unknown as User;

function roleWith(permissions: string[]): Role {
    return {
        slug: 'test',
        name: 'Test',
        permissions: permissions as Role['permissions'],
        isBuiltIn: false,
    };
}

/** Mount the entries router in isolation with an injected role and the app's `onError`. */
function mountedApp(role: Role): OpenAPIHono<{ Variables: AuthVariables }> {
    const app = new OpenAPIHono<{ Variables: AuthVariables }>();
    app.onError(onError);
    app.use('/entries/*', async (c, next) => {
        c.set('ctx', createAppContext({ user: fakeUser, role: role }));
        return next();
    });
    app.route('/entries', createEntriesRouter());
    return app;
}

const app = (): OpenAPIHono<{ Variables: AuthVariables }> => mountedApp(roleWith(['*']));

async function trashedPost(): Promise<Entry> {
    const entry = await api.create({
        type: 'post',
        data: { title: 'Gone', status: 'published' },
    });
    await api.trash({ type: 'post', id: entry.id });
    return entry;
}

beforeEach(async () => {
    await createTestDb();
    setupTestConfig();
});

describe('trashed reads require the full shape', () => {
    it('GET /:type?trashed=true answers 400 without full', async () => {
        await trashedPost();
        const res = await app().request('/entries/post?trashed=true');
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: { code: string; message: string } };
        expect(body.error.code).toBe('BAD_REQUEST');
        expect(body.error.message).toMatch(/trashed reads require the full shape/);
    });

    it('GET /:type?trashed=true&full=true still returns the trashed rows', async () => {
        await trashedPost();
        const res = await app().request('/entries/post?trashed=true&full=true');
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: Entry[] };
        expect(body.data.map((e) => e.title)).toEqual(['Gone']);
    });

    it('POST /:type/query answers 400 without full and 200 with it', async () => {
        await trashedPost();

        const denied = await app().request('/entries/post/query', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ trashed: true }),
        });
        expect(denied.status).toBe(400);

        const allowed = await app().request('/entries/post/query', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ trashed: true, full: true }),
        });
        expect(allowed.status).toBe(200);
        const body = (await allowed.json()) as { data: Entry[] };
        expect(body.data.map((e) => e.title)).toEqual(['Gone']);
    });

    it('POST /query (cross-type) answers 400 without full', async () => {
        await trashedPost();
        const res = await app().request('/entries/query', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ type: ['post'], trashed: true }),
        });
        expect(res.status).toBe(400);
    });
});

/** `links/link` is stored in its own table. */
function linksPlugin(): PluginDefinition {
    const linksTable = defineTable('test_links', ({ col }) => ({
        id: col.id(),
        label: col.text({ notNull: true }),
    }));
    return {
        package: '@astromech/links',
        entries: [
            {
                type: 'link',
                single: 'Link',
                plural: 'Links',
                titleField: false,
                statuses: false,
                slug: false,
                trash: false,
                repository: tableRepository(linksTable),
                fields: [{ name: 'label', type: 'text', label: 'Label' }],
            },
        ],
    };
}

describe('a cross-type query naming a custom-table type', () => {
    beforeEach(() => {
        setupTestConfig({ ...makeTestConfig(), plugins: [linksPlugin()] });
    });

    it('POST /query answers 400 and says to query that type on its own', async () => {
        const res = await app().request('/entries/query', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ type: ['post', 'links/link'] }),
        });
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: { code: string; message: string } };
        expect(body.error.code).toBe('BAD_REQUEST');
        expect(body.error.message).toMatch(/Query links\/link on its own/);
    });
});
