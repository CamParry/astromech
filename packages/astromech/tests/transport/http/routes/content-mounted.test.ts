/**
 * The content router (`POST /content/:type/:id/{translate,transform,generate}`)
 * over the real Local API + DB, with the in-memory provider — no network call.
 *
 * The double gate is what these tests own: a content operation mutates an ENTRY,
 * so the descriptor's `content:*` permission alone must not rewrite a type the
 * caller cannot update, and entry update alone must not buy access to a model.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { OpenAPIHono } from '@hono/zod-openapi';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness.js';
import { createFakeContentProvider } from '@tests/fake-content-provider.js';
import { setContentProvider } from '@/content/provider.js';
import { contentRouter } from '@/transport/http/routes/content.js';
import { create } from '@/entries/operations/create.js';
import type { AuthVariables } from '@/transport/http/middleware/auth.js';
import type { AstromechConfig, Entry, Role, User } from '@/types/index.js';

const fakeUser = { id: 'u1', email: 'a@b.dev' } as unknown as User;

function roleWith(permissions: string[]): Role {
    return {
        slug: 'test',
        name: 'Test',
        permissions: permissions as Role['permissions'],
        isBuiltIn: false,
    };
}

/** Mount the real content router behind a stub that injects user + role. */
function mountedApp(role: Role): OpenAPIHono<{ Variables: AuthVariables }> {
    const app = new OpenAPIHono<{ Variables: AuthVariables }>();
    app.use('/content/*', async (c, next) => {
        c.set('user', fakeUser);
        c.set('role', role);
        return next();
    });
    app.route('/content', contentRouter);
    return app;
}

function makeContentConfig(): AstromechConfig {
    const cfg = makeTestConfig();
    cfg.entries['article'] = {
        single: 'Article',
        plural: 'Articles',
        translatable: true,
        staging: true,
        fields: [{ name: 'summary', type: 'text', label: 'Summary' }],
    };
    return cfg;
}

async function makeArticle(): Promise<Entry> {
    return create({
        type: 'article',
        title: 'Hello title',
        slug: 'hello',
        locale: 'en',
        status: 'published',
        fields: { summary: 'Hello summary' },
    });
}

async function post(
    app: OpenAPIHono<{ Variables: AuthVariables }>,
    path: string,
    body: unknown
): Promise<Response> {
    return app.request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeContentConfig());
    setContentProvider(
        createFakeContentProvider({
            rewrite: (input) => input.replace(/Hello/g, 'Salut'),
        })
    );
});

// ============================================================================
// The double gate
// ============================================================================

describe('content routes — the two-permission gate', () => {
    it('403s a caller holding content:translate but not the type’s update', async () => {
        const article = await makeArticle();
        const app = mountedApp(roleWith(['content:translate']));

        const res = await post(app, `/content/article/${article.id}/translate`, {
            locale: 'de',
        });
        expect(res.status).toBe(403);
    });

    it('403s a caller holding the type’s update but no content permission', async () => {
        const article = await makeArticle();
        const app = mountedApp(roleWith(['entry:article:update']));

        const res = await post(app, `/content/article/${article.id}/transform`, {
            instruction: 'shorter',
        });
        expect(res.status).toBe(403);
    });

    it('403s a caller whose update is for a DIFFERENT type', async () => {
        // The half the descriptor cannot state: `content:transform` is one
        // permission for every type, so the entry half has to name the target.
        const article = await makeArticle();
        const app = mountedApp(roleWith(['content:transform', 'entry:post:update']));

        const res = await post(app, `/content/article/${article.id}/transform`, {
            instruction: 'shorter',
        });
        expect(res.status).toBe(403);
    });

    it('lets a caller holding both through', async () => {
        const article = await makeArticle();
        const app = mountedApp(roleWith(['content:transform', 'entry:article:update']));

        const res = await post(app, `/content/article/${article.id}/transform`, {
            instruction: 'shorter',
        });
        expect(res.status).toBe(200);
    });

    it('grants all three to the built-in editor role', async () => {
        // `entry:*` covers the entry half, so an editor needs the content half
        // to be grantable at all — the reason the keys are in CORE_PERMISSIONS.
        const article = await makeArticle();
        const app = mountedApp(
            roleWith(['content:generate', 'content:translate', 'entry:*'])
        );

        const res = await post(app, `/content/article/${article.id}/generate`, {
            instruction: 'write a summary',
        });
        expect(res.status).toBe(200);
    });
});

// ============================================================================
// Operations over the wire
// ============================================================================

describe('content routes — operations', () => {
    const full = [
        'content:translate',
        'content:transform',
        'content:generate',
        'entry:*',
    ];

    it('stages a transform and returns the staged id', async () => {
        const article = await makeArticle();
        const app = mountedApp(roleWith(full));

        const res = await post(app, `/content/article/${article.id}/transform`, {
            instruction: 'shorter',
        });
        expect(res.status).toBe(200);

        const body = (await res.json()) as {
            data: { id: string; outcome: string; fields: { path: string }[] };
        };
        expect(body.data.outcome).toBe('staged');
        expect(body.data.id).not.toBe(article.id);
        expect(body.data.fields.map((f) => f.path)).toContain('summary');
    });

    it('creates an unpublished sibling when translating into a new locale', async () => {
        const article = await makeArticle();
        const app = mountedApp(roleWith(full));

        const res = await post(app, `/content/article/${article.id}/translate`, {
            locale: 'de',
        });
        expect(res.status).toBe(200);
        expect(((await res.json()) as { data: { outcome: string } }).data.outcome).toBe(
            'created'
        );
    });

    it('narrows the rewrite to the paths the body names', async () => {
        const article = await makeArticle();
        const app = mountedApp(roleWith(full));

        const res = await post(app, `/content/article/${article.id}/transform`, {
            instruction: 'shorter',
            paths: ['summary'],
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: { fields: { path: string }[] } };
        expect(body.data.fields.map((f) => f.path)).toEqual(['summary']);
    });
});

// ============================================================================
// Refusals that are not about permissions
// ============================================================================

describe('content routes — bad requests', () => {
    const full = [
        'content:translate',
        'content:transform',
        'content:generate',
        'entry:*',
    ];

    it('422s a transform with no instruction', async () => {
        const article = await makeArticle();
        const app = mountedApp(roleWith(full));

        const res = await post(app, `/content/article/${article.id}/transform`, {});
        expect(res.status).toBe(422);
    });

    it('404s an unknown entry type', async () => {
        const app = mountedApp(roleWith(['*']));
        const res = await post(app, '/content/nope/anyid/transform', {
            instruction: 'x',
        });
        expect(res.status).toBe(404);
    });

    it('400s a target the operation cannot act on', async () => {
        const app = mountedApp(roleWith(full));
        const res = await post(app, '/content/article/missing-id/transform', {
            instruction: 'x',
        });
        expect(res.status).toBe(400);
    });

    it('409s a type that lacks the capability the operation needs', async () => {
        // `post` is translatable but has no staging, so transform cannot land.
        const entry = await create({
            type: 'post',
            title: 'P',
            slug: 'p',
            fields: { body: 'Hello body' },
        });
        const app = mountedApp(roleWith(full));

        const res = await post(app, `/content/post/${entry.id}/transform`, {
            instruction: 'x',
        });
        expect(res.status).toBe(409);
    });
});
