/**
 * Field-validation status codes over the real routers + `onError`.
 *
 * The field pipeline raises `ValidationError.fromFieldErrors`, which `onError`
 * maps to a 422 carrying `details.fields`. Every route handler used to wrap its
 * body in a blanket `try/catch` returning `internalError(...)`, so that
 * `ValidationError` was flattened to a 500 ("Internal server error: Validation
 * failed") before `onError` could see it — for every domain, since the CMS
 * shipped. These tests pin the 422 at the HTTP boundary for all four domains
 * that run the pipeline (entries, users, media, settings).
 *
 * Two things beyond the bare status:
 *  - a NESTED error key (`socials[<id>].url`, produced by the repeater's
 *    `_id`-based path grammar) must survive verbatim into the response body —
 *    that is the key the admin's `useFieldError(path)` looks up;
 *  - a non-`ValidationError` failure must still be a 500 with a `console.error`,
 *    so removing the blanket catches is pinned as behaviour-preserving rather
 *    than "everything is 422 now".
 *
 * Zod envelope errors (a malformed request body) are a separate path handled by
 * the routes' own `fromZodError`/`zodValidationError` helpers and already
 * worked; they are not what is under test here.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAPIHono } from '@hono/zod-openapi';
import {
    createTestDb,
    createTestUser,
    makeTestConfig,
    setupTestConfig,
} from '@tests/harness.js';
import { setStorageDriver } from '@/storage/registry.js';
import { Astromech } from '@/transport/local/index.js';
import { onError } from '@/transport/http/middleware/errors.js';
import { createEntriesRouter } from '@/transport/http/routes/entries.js';
import { usersRouter } from '@/transport/http/routes/users.js';
import { mediaRouter } from '@/transport/http/routes/media.js';
import { settingsRouter } from '@/transport/http/routes/settings.js';
import type { AuthVariables } from '@/transport/http/middleware/auth.js';
import type { AstromechConfig, Role, StorageDriver, User } from '@/types/index.js';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

type ErrorBody = {
    error: {
        code: string;
        message: string;
        status: number;
        details?: { fields?: Record<string, string[]> };
    };
};

const fakeUser = { id: 'u1', email: 'a@b.dev' } as unknown as User;

const adminRole: Role = {
    slug: 'admin',
    name: 'Admin',
    permissions: ['*'] as Role['permissions'],
    isBuiltIn: true,
};

/** In-memory storage so `media.upload` can persist a record to update. */
function memoryStorage(): StorageDriver {
    const store = new Map<string, Uint8Array>();
    return {
        name: 'memory',
        async put(key, body) {
            store.set(key, body instanceof Uint8Array ? body : new Uint8Array());
        },
        async get(key) {
            const bytes = store.get(key);
            if (!bytes) return null;
            return {
                body: new ReadableStream<Uint8Array>({
                    start(c) {
                        c.enqueue(bytes);
                        c.close();
                    },
                }),
                size: bytes.length,
                totalSize: bytes.length,
            };
        },
        async stat(key) {
            const bytes = store.get(key);
            return bytes ? { size: bytes.length } : null;
        },
        async delete(key) {
            store.delete(key);
        },
        async list(prefix) {
            return { keys: [...store.keys()].filter((k) => k.startsWith(prefix)) };
        },
        getPublicUrl: () => null,
    };
}

/**
 * Mount the real routers exactly as `transport/http/index.ts` does — including
 * `app.onError(onError)`, which is the seam under test — behind a stub that
 * injects an admin user/role (Better Auth sessions are out of scope here).
 */
function mountedApp(): OpenAPIHono<{ Variables: AuthVariables }> {
    const app = new OpenAPIHono<{ Variables: AuthVariables }>();
    app.onError(onError);
    app.use('*', async (c, next) => {
        c.set('user', fakeUser);
        c.set('role', adminRole);
        return next();
    });
    app.route('/entries', createEntriesRouter());
    app.route('/users', usersRouter);
    app.route('/media', mediaRouter);
    app.route('/settings', settingsRouter);
    return app;
}

/** The admin page whose `fields` govern `settings.set` validation. */
const SETTINGS_KEY = 'site';

/**
 * One config covering all four domains. `boom` (on `note`) is the
 * non-`ValidationError` probe: a `custom` rule that throws rather than
 * returning a message, so the pipeline propagates a plain `Error`.
 */
function makeConfig(): AstromechConfig {
    const base = makeTestConfig();
    return {
        ...base,
        entries: {
            ...base.entries,
            post: {
                ...base.entries['post'],
                single: 'Post',
                plural: 'Posts',
                fields: [
                    {
                        name: 'contact',
                        type: 'text',
                        label: 'Contact',
                        validation: [{ email: true }],
                    },
                    {
                        name: 'socials',
                        type: 'repeater',
                        label: 'Socials',
                        fields: [{ name: 'url', type: 'url', label: 'URL' }],
                    },
                ],
            },
            note: {
                ...base.entries['note'],
                single: 'Note',
                plural: 'Notes',
                fields: [
                    {
                        name: 'boom',
                        type: 'text',
                        label: 'Boom',
                        validation: [
                            {
                                custom: () => {
                                    throw new Error('rule exploded');
                                },
                            },
                        ],
                    },
                ],
            },
        },
        users: {
            fields: [{ name: 'bio', type: 'text', label: 'Bio', required: true }],
        },
        media: {
            fields: [{ name: 'caption', type: 'text', label: 'Caption', required: true }],
        },
        admin: {
            pages: [
                {
                    path: SETTINGS_KEY,
                    label: 'Site',
                    fields: [
                        {
                            name: 'contact',
                            type: 'text',
                            label: 'Contact',
                            validation: [{ email: true }],
                        },
                    ],
                },
            ],
        },
    };
}

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeConfig());
    setStorageDriver(memoryStorage());
});

afterEach(() => {
    vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// entries
// ---------------------------------------------------------------------------

describe('PUT /entries/:type/:id — invalid field value', () => {
    async function createPost(app: OpenAPIHono<{ Variables: AuthVariables }>) {
        const res = await app.request('/entries/post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'P1' }),
        });
        expect(res.status).toBe(201);
        return ((await res.json()) as { data: { id: string } }).data.id;
    }

    it('422s with details.fields rather than 500ing', async () => {
        const app = mountedApp();
        const id = await createPost(app);

        const res = await app.request(`/entries/post/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: { contact: 'not-an-email' } }),
        });

        expect(res.status).toBe(422);
        const body = (await res.json()) as ErrorBody;
        expect(body.error.code).toBe('VALIDATION_FAILED');
        expect(body.error.details?.fields).toEqual({
            contact: ['Must be a valid email address'],
        });
    });

    it('carries a NESTED repeater sub-field key through to the response body', async () => {
        const app = mountedApp();
        const id = await createPost(app);

        // The `_id` is submitted, so the pipeline's `_id`-based path grammar
        // produces a deterministic key we can assert on exactly.
        const res = await app.request(`/entries/post/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fields: { socials: [{ _id: 'sock1', url: 'not-a-url' }] },
            }),
        });

        expect(res.status).toBe(422);
        const body = (await res.json()) as ErrorBody;
        expect(body.error.details?.fields).toEqual({
            'socials[sock1].url': ['Must be a valid URL'],
        });
    });
});

describe('POST /entries/:type — invalid field value', () => {
    it('422s with details.fields', async () => {
        const app = mountedApp();
        const res = await app.request('/entries/post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'P2', fields: { contact: 'nope' } }),
        });

        expect(res.status).toBe(422);
        const body = (await res.json()) as ErrorBody;
        expect(body.error.details?.fields).toEqual({
            contact: ['Must be a valid email address'],
        });
    });
});

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

describe('users routes — invalid field value', () => {
    it('POST /users 422s with details.fields', async () => {
        const app = mountedApp();
        const res = await app.request('/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'new@test.dev',
                name: 'New User',
                fields: { bio: '' },
            }),
        });

        expect(res.status).toBe(422);
        const body = (await res.json()) as ErrorBody;
        expect(body.error.code).toBe('VALIDATION_FAILED');
        expect(body.error.details?.fields).toEqual({ bio: ['This field is required'] });
    });

    it('PUT /users/:id 422s with details.fields', async () => {
        const db = await createTestDb();
        setupTestConfig(makeConfig());
        const existing = await createTestUser(db);

        const app = mountedApp();
        const res = await app.request(`/users/${existing.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: {} }),
        });

        expect(res.status).toBe(422);
        const body = (await res.json()) as ErrorBody;
        expect(body.error.details?.fields).toEqual({ bio: ['This field is required'] });
    });
});

// ---------------------------------------------------------------------------
// media
// ---------------------------------------------------------------------------

describe('PUT /media/:id — invalid field value', () => {
    it('422s with details.fields', async () => {
        const item = await Astromech.media.upload({
            file: new File(['hello' as BlobPart], 'doc.txt', { type: 'text/plain' }),
        });

        const app = mountedApp();
        const res = await app.request(`/media/${item.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: { caption: '' } }),
        });

        expect(res.status).toBe(422);
        const body = (await res.json()) as ErrorBody;
        expect(body.error.code).toBe('VALIDATION_FAILED');
        expect(body.error.details?.fields).toEqual({
            caption: ['This field is required'],
        });
    });
});

// ---------------------------------------------------------------------------
// settings
// ---------------------------------------------------------------------------

describe('PUT /settings/:key — invalid field value', () => {
    it('422s with details.fields', async () => {
        const app = mountedApp();
        const res = await app.request(`/settings/${SETTINGS_KEY}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: { contact: 'not-an-email' } }),
        });

        expect(res.status).toBe(422);
        const body = (await res.json()) as ErrorBody;
        expect(body.error.code).toBe('VALIDATION_FAILED');
        expect(body.error.details?.fields).toEqual({
            contact: ['Must be a valid email address'],
        });
    });
});

// ---------------------------------------------------------------------------
// Non-ValidationError failures are still 500s
// ---------------------------------------------------------------------------

describe('a non-ValidationError failure', () => {
    it('still returns 500 INTERNAL_ERROR, and is logged', async () => {
        const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const app = mountedApp();

        const res = await app.request('/entries/note', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'N1', fields: { boom: 'anything' } }),
        });

        expect(res.status).toBe(500);
        const body = (await res.json()) as ErrorBody;
        expect(body.error.code).toBe('INTERNAL_ERROR');
        expect(body.error.details).toBeUndefined();
        // The blanket catches also swallowed onError's `console.error`, so an
        // internal failure left no server-side trace at all.
        expect(logged).toHaveBeenCalled();
    });
});
