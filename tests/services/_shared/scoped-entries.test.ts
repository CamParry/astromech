/**
 * Unit: `createScopedEntries` qualifies bare type ids to the plugin namespace
 * before delegating, across the full `EntriesApi` surface. Uses a recording
 * stub — no DB.
 */

import { describe, expect, it } from 'vitest';
import { createScopedEntries } from '@/entries/scoped-entries.js';
import type { EntriesApi } from '@/types/index.js';

/** A stub that records the `type` each method was called with. */
function recordingApi(): { api: EntriesApi; calls: { method: string; type: unknown }[] } {
    const calls: { method: string; type: unknown }[] = [];
    const record =
        (method: string) =>
        (params: { type: unknown }): Promise<unknown> => {
            calls.push({ method, type: params.type });
            return Promise.resolve(undefined);
        };
    const api = {
        query: record('query'),
        get: record('get'),
        create: record('create'),
        update: record('update'),
        duplicate: record('duplicate'),
        trash: record('trash'),
        restore: record('restore'),
        delete: record('delete'),
        emptyTrash: record('emptyTrash'),
        versions: record('versions'),
        restoreVersion: record('restoreVersion'),
        publish: record('publish'),
        unpublish: record('unpublish'),
        schedule: record('schedule'),
        incomingRelations: record('incomingRelations'),
    } as unknown as EntriesApi;
    return { api, calls };
}

describe('createScopedEntries', () => {
    it('qualifies the bare type on a single-type method', async () => {
        const { api, calls } = recordingApi();
        const scoped = createScopedEntries('redirects', api);
        await scoped.get({ type: 'redirect', id: 'x' });
        expect(calls).toEqual([{ method: 'get', type: 'redirects/redirect' }]);
    });

    it('qualifies each element of an array `type` in query', async () => {
        const { api, calls } = recordingApi();
        const scoped = createScopedEntries('redirects', api);
        await scoped.query({ type: ['redirect', 'alias'] });
        expect(calls[0]).toEqual({
            method: 'query',
            type: ['redirects/redirect', 'redirects/alias'],
        });
    });

    it('qualifies a string `type` in query', async () => {
        const { api, calls } = recordingApi();
        const scoped = createScopedEntries('redirects', api);
        await scoped.query({ type: 'redirect' });
        expect(calls[0]).toEqual({ method: 'query', type: 'redirects/redirect' });
    });

    it('qualifies across the write/lifecycle surface', async () => {
        const { api, calls } = recordingApi();
        const scoped = createScopedEntries('shop', api);
        await scoped.create({ type: 'product', title: 'P' });
        await scoped.update({ type: 'product', id: '1', data: {} });
        await scoped.publish({ type: 'product', id: '1' });
        await scoped.delete({ type: 'product', id: '1' });
        await scoped.versions({ type: 'product', id: '1' });
        expect(calls.map((c) => c.type)).toEqual([
            'shop/product',
            'shop/product',
            'shop/product',
            'shop/product',
            'shop/product',
        ]);
    });
});
