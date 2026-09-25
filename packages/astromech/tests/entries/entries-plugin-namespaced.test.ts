/**
 * Integration: the entries service resolves QUALIFIED plugin type ids
 * (`{plugin}/{type}`) from `ResolvedConfig.entryTypes` and round-trips CRUD
 * through the entry repository, storing the qualified id in the `type` column.
 * Root types are unaffected.
 */

import type { AstromechConfig, PluginDefinition } from '@/types/index';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { beforeAll, describe, expect, it } from 'vitest';
import { currentServices } from '@/app-context/services';

const entriesService = currentServices.entries;

const formsPlugin: PluginDefinition = {
    package: '@astromech/forms',
    entries: [
        {
            type: 'form',
            single: 'Form',
            plural: 'Forms',
            fields: [{ name: 'to', type: 'text', label: 'To' }],
        },
    ],
};

function configWithPlugin(): AstromechConfig {
    return { ...makeTestConfig(), plugins: [formsPlugin] };
}

describe('namespaced plugin entries via the entries service', () => {
    beforeAll(async () => {
        await createTestDb();
        setupTestConfig(configWithPlugin());
    });

    it('round-trips CRUD on a qualified type and stores the qualified id', async () => {
        const created = await entriesService.create({
            type: 'forms/form',
            data: { title: 'Home', fields: { to: '/' } },
        });
        expect(created.type).toBe('forms/form');

        // full: true — admin read; entry is unpublished
        const fetched = await entriesService.get({
            type: 'forms/form',
            id: created.id,
            full: true,
        });
        expect(fetched?.id).toBe(created.id);
        expect(fetched?.type).toBe('forms/form');

        const updated = await entriesService.update({
            type: 'forms/form',
            id: created.id,
            data: { title: 'Homepage' },
        });
        expect((updated as { title: string }).title).toBe('Homepage');

        await entriesService.delete({ type: 'forms/form', id: created.id });
        const gone = await entriesService.get({
            type: 'forms/form',
            id: created.id,
        });
        expect(gone).toBeNull();
    });

    it('leaves root types unaffected', async () => {
        const post = await entriesService.create({
            type: 'post',
            data: { title: 'A Post' },
        });
        expect(post.type).toBe('post');
        const list = await entriesService.query({ type: 'forms/form' });
        expect(list.data.every((e) => e.type === 'forms/form')).toBe(true);
    });
});
