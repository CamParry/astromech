/**
 * Both `routes/entry-types.ts` handlers over the real router.
 *
 * These are the admin's entry-type metadata feed. Neither has a service method
 * or a permission check behind it, and the list handler answers with a bare
 * array rather than the `{ data }` envelope every other route uses — so the
 * keys asserted here are the whole of the contract.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { mountRouter, roleWith } from '@tests/mount-router';
import { entryTypesRouter } from '@/transport/http/routes/entry-types';
import type { AstromechConfig, PluginDefinition } from '@/types/index';

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

/** No permission is checked, so the emptiest role is the honest one to use. */
function app() {
    return mountRouter('/entry-types', entryTypesRouter, roleWith([]));
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

    it('404s an unknown type', async () => {
        const res = await app().request('/entry-types/nope');
        expect(res.status).toBe(404);
        const body = (await res.json()) as { error: { code: string; message: string } };
        expect(body.error.code).toBe('NOT_FOUND');
        expect(body.error.message).toBe("Entry type 'nope' not found");
    });

    it('404s a plugin entry type, which the entries router does serve', async () => {
        const res = await app().request(
            `/entry-types/${encodeURIComponent('widgets/widget')}`
        );
        expect(res.status).toBe(404);
    });
});
