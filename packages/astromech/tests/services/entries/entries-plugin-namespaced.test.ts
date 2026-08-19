/**
 * Integration: the entries service resolves QUALIFIED plugin type ids
 * (`{plugin}/{type}`) against `ResolvedConfig.pluginEntries` and round-trips
 * CRUD through the built-in storage, storing the qualified id in the `type`
 * column. Root types are unaffected.
 */

import type { AstromechConfig, PluginDefinition } from '@/types/index';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeAll, describe, expect, it } from 'vitest';
import { entriesService } from '@/entries/service';

const redirectsPlugin: PluginDefinition = {
    package: '@astromech/redirects',
    entries: [
        {
            type: 'redirect',
            single: 'Redirect',
            plural: 'Redirects',
            fields: [{ name: 'to', type: 'text', label: 'To' }],
        },
    ],
};

function configWithPlugin(): AstromechConfig {
    return { ...makeTestConfig(), plugins: [redirectsPlugin] };
}

describe('namespaced plugin entries via the entries service', () => {
    beforeAll(async () => {
        await createTestDb();
        setupTestConfig(configWithPlugin());
    });

    it('round-trips CRUD on a qualified type and stores the qualified id', async () => {
        const created = await entriesService.create({
            type: 'redirects/redirect',
            title: 'Home',
            fields: { to: '/' },
        });
        expect(created.type).toBe('redirects/redirect');

        // full: true — admin read; entry is unpublished
        const fetched = await entriesService.get({
            type: 'redirects/redirect',
            id: created.id,
            full: true,
        });
        expect(fetched?.id).toBe(created.id);
        expect(fetched?.type).toBe('redirects/redirect');

        const updated = await entriesService.update({
            type: 'redirects/redirect',
            id: created.id,
            data: { title: 'Homepage' },
        });
        expect((updated as { title: string }).title).toBe('Homepage');

        await entriesService.delete({ type: 'redirects/redirect', id: created.id });
        const gone = await entriesService.get({
            type: 'redirects/redirect',
            id: created.id,
        });
        expect(gone).toBeNull();
    });

    it('leaves root types unaffected', async () => {
        const post = await entriesService.create({ type: 'post', title: 'A Post' });
        expect(post.type).toBe('post');
        const list = await entriesService.query({ type: 'redirects/redirect' });
        expect(list.data.every((e) => e.type === 'redirects/redirect')).toBe(true);
    });
});
