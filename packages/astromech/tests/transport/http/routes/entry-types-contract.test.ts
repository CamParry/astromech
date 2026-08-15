/**
 * Both `routes/entry-types.ts` handlers over the real router.
 *
 * These are the admin's entry-type metadata feed. Neither has a service method
 * behind it, and the list handler answers with a bare array rather than the
 * `{ data }` envelope every other route uses — so the keys asserted here are the
 * whole of the contract.
 *
 * Both gate on `entry:{type}:read`: the list filters to the readable types, the
 * single read 403s before it looks the type up.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { mountRouter, roleWith } from '@tests/mount-router';
import { entryTypesRouter } from '@/transport/http/routes/entry-types';
import type { AstromechConfig, PluginDefinition, Role } from '@/types/index';

const widgetsPlugin: PluginDefinition = {
    package: 'widgets',
    entries: [
        {
            type: 'widget',
            single: 'Widget',
            plural: 'Widgets',
            fields: [{ name: 'label', type: 'text', label: 'Label' }],
        },
    ],
};

function configWithWidgets(): AstromechConfig {
    return { ...makeTestConfig(), plugins: [widgetsPlugin] };
}

/** Read on every type the contract assertions below name, and nothing else. */
const READER = roleWith([
    'entry:post:read',
    'entry:note:read',
    'entry:snippet:read',
    'entry:card:read',
    'entry:bookmark:read',
    'plugin:widgets:entry:widget:read',
]);

function app(role: Role = READER) {
    return mountRouter('/entry-types', entryTypesRouter, role);
}

type TypeMeta = {
    type: string;
    single: string;
    plural: string;
    versioning: boolean;
    slug: string | null;
    adminColumns: string[];
    fields: unknown[];
    capabilities: Record<string, boolean>;
    titleField: 'title' | false;
};

const META_KEYS = [
    'adminColumns',
    'capabilities',
    'fields',
    'plural',
    'single',
    'slug',
    'titleField',
    'type',
    'versioning',
];

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(configWithWidgets());
});

describe('GET /entry-types', () => {
    it('returns a bare array — no { data } envelope', async () => {
        const res = await app().request('/entry-types');
        expect(res.status).toBe(200);
        const body = (await res.json()) as TypeMeta[];
        expect(Array.isArray(body)).toBe(true);
        expect(body.map((t) => t.type)).toEqual([
            'post',
            'note',
            'snippet',
            'card',
            'bookmark',
        ]);
    });

    it('projects exactly nine keys per type', async () => {
        const res = await app().request('/entry-types');
        const [post] = (await res.json()) as TypeMeta[];
        expect(Object.keys(post ?? {}).sort()).toEqual(META_KEYS);
        expect(post?.single).toBe('Post');
        expect(post?.plural).toBe('Posts');
        expect(post?.versioning).toBe(true);
        expect(post?.capabilities['statuses']).toBe(true);
    });

    it('lists no plugin entry type — the handler reads config.entries only', async () => {
        const res = await app().request('/entry-types');
        const body = (await res.json()) as TypeMeta[];
        expect(body.some((t) => t.type.includes('widget'))).toBe(false);
    });

    it('reports titleField: false for a titleless type', async () => {
        const res = await app().request('/entry-types');
        const body = (await res.json()) as TypeMeta[];
        expect(body.find((t) => t.type === 'snippet')?.titleField).toBe(false);
        expect(body.find((t) => t.type === 'snippet')?.capabilities['statuses']).toBe(
            false
        );
    });
});

describe('GET /entry-types/:type', () => {
    it('returns one type, unenveloped, with the same nine keys', async () => {
        const res = await app().request('/entry-types/note');
        expect(res.status).toBe(200);
        const body = (await res.json()) as TypeMeta;
        expect(Object.keys(body).sort()).toEqual(META_KEYS);
        expect(body.type).toBe('note');
        expect(body.versioning).toBe(false);
    });

    it('404s an unknown type for a role that may read it', async () => {
        const res = await app(roleWith(['*'])).request('/entry-types/nope');
        expect(res.status).toBe(404);
        const body = (await res.json()) as { error: { code: string; message: string } };
        expect(body.error.code).toBe('NOT_FOUND');
        expect(body.error.message).toBe("Entry type 'nope' not found");
    });

    it('serves a plugin entry type by its qualified id', async () => {
        const res = await app().request(
            `/entry-types/${encodeURIComponent('widgets/widget')}`
        );
        expect(res.status).toBe(200);
        const body = (await res.json()) as TypeMeta;
        expect(Object.keys(body).sort()).toEqual(META_KEYS);
        expect(body.type).toBe('widgets/widget');
        expect(body.single).toBe('Widget');
        expect(body.plural).toBe('Widgets');
    });

    it('403s a plugin entry type before resolving it, for a role lacking its read', async () => {
        const res = await app(roleWith(['entry:post:read'])).request(
            `/entry-types/${encodeURIComponent('widgets/widget')}`
        );
        expect(res.status).toBe(403);
        const body = (await res.json()) as { error: { code: string } };
        expect(body.error.code).toBe('FORBIDDEN');
    });
});

describe('entry:{type}:read gates both handlers', () => {
    it('lists nothing for a role holding no read — an empty array, not a 403', async () => {
        const res = await app(roleWith([])).request('/entry-types');
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual([]);
    });

    it('lists only the types the role may read', async () => {
        const res = await app(roleWith(['entry:note:read'])).request('/entry-types');
        const body = (await res.json()) as TypeMeta[];
        expect(body.map((t) => t.type)).toEqual(['note']);
    });

    it('403s a single type the role may not read', async () => {
        const res = await app(roleWith([])).request('/entry-types/post');
        expect(res.status).toBe(403);
        const body = (await res.json()) as { error: { code: string } };
        expect(body.error.code).toBe('FORBIDDEN');
    });

    it('403s an unknown type rather than 404ing it — the 404 would enumerate', async () => {
        const res = await app(roleWith([])).request('/entry-types/nope');
        expect(res.status).toBe(403);
    });
});
