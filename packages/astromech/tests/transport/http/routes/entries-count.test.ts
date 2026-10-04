/**
 * `POST /entries/count`: the entries of several types counted in one request,
 * as the admin dashboard asks for them, with each type's read permission
 * checked as the cross-type query checks it.
 */

import type { AuthVariables } from '@/transport/http/middleware/auth';
import type { Role } from '@/types/index';
import { OpenAPIHono } from '@hono/zod-openapi';
import { makeUser, roleWith } from '@tests/fixtures';
import { createTestDb, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAppContext } from '@/app-context/app-context';
import { currentServices } from '@/app-context/services';
import { onError } from '@/transport/http/middleware/errors';
import { createEntriesRouter } from '@/transport/http/routes/entries';

const api = currentServices.entries;

/** Mount the entries router in isolation with an injected role and the app's `onError`. */
function mountedApp(role: Role): OpenAPIHono<{ Variables: AuthVariables }> {
    const app = new OpenAPIHono<{ Variables: AuthVariables }>();
    app.onError(onError);
    app.use('/entries/*', async (c, next) => {
        c.set('ctx', createAppContext({ user: makeUser({ id: 'u1' }), role }));
        return next();
    });
    app.route('/entries', createEntriesRouter());
    return app;
}

function count(role: Role, body: Record<string, unknown>): Promise<Response> {
    return Promise.resolve(
        mountedApp(role).request('/entries/count', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        })
    );
}

beforeEach(async () => {
    await createTestDb();
    setupTestConfig();
    await api.create({ type: 'post', data: { title: 'Live', status: 'published' } });
    await api.create({ type: 'post', data: { title: 'Draft' } });
    const gone = await api.create({ type: 'post', data: { title: 'Gone' } });
    await api.trash({ type: 'post', id: gone.id });
    await api.create({ type: 'note', data: { title: 'Note' } });
});

describe('POST /entries/count', () => {
    it('counts every entry not in the trash, per type, in the full shape', async () => {
        const res = await count(roleWith(['*']), {
            type: ['post', 'note', 'card'],
            full: true,
        });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ data: { post: 2, note: 1, card: 0 } });
    });

    it('counts only published entries in the public shape', async () => {
        const res = await count(roleWith(['entry:post:read']), { type: 'post' });

        expect(await res.json()).toEqual({ data: { post: 1 } });
    });

    it('refuses a type the role cannot read', async () => {
        const res = await count(roleWith(['entry:post:read', 'entry:read:full']), {
            type: ['post', 'note'],
            full: true,
        });

        expect(res.status).toBe(403);
    });
});
