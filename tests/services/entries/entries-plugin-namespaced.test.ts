/**
 * Integration: the entries service resolves QUALIFIED plugin type ids
 * (`{plugin}/{type}`) against `ResolvedConfig.pluginEntries` and round-trips
 * CRUD through the built-in storage, storing the qualified id in the `type`
 * column. Root types are unaffected.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness.js';
import { entries } from '@/entries/service.js';
import type { AstromechConfig, PluginDefinition } from '@/types/index.js';

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
        const created = await entries.create({
            type: 'redirects/redirect',
            title: 'Home',
            fields: { to: '/' },
        });
        expect(created.type).toBe('redirects/redirect');

        // full: true — admin read; entry is a draft
        const fetched = await entries.get({
            type: 'redirects/redirect',
            id: created.id,
            full: true,
        });
        expect(fetched?.id).toBe(created.id);
        expect(fetched?.type).toBe('redirects/redirect');

        const updated = await entries.update({
            type: 'redirects/redirect',
            id: created.id,
            data: { title: 'Homepage' },
        });
        expect((updated as { title: string }).title).toBe('Homepage');

        await entries.delete({ type: 'redirects/redirect', id: created.id });
        const gone = await entries.get({ type: 'redirects/redirect', id: created.id });
        expect(gone).toBeNull();
    });

    it('leaves root types unaffected', async () => {
        const post = await entries.create({ type: 'post', title: 'A Post' });
        expect(post.type).toBe('post');
        const list = await entries.query({ type: 'redirects/redirect' });
        expect(list.data.every((e) => e.type === 'redirects/redirect')).toBe(true);
    });
});
