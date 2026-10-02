/**
 * `listAll` and `deletePrefix` follow a driver's `list` cursor across pages.
 * The driver is the real filesystem one, listing two keys a page so a short
 * prefix spans several.
 */

import type { StorageDriver } from '@/types/index';
import { createTestStorage } from '@tests/harness';
import { describe, expect, it, vi } from 'vitest';
import { deletePrefix, listAll } from '@/storage/prefix';

/** A filesystem driver holding `keys`, whose `list` answers two keys a page. */
async function pagedStorage(keys: string[]): Promise<StorageDriver> {
    const storage = createTestStorage();
    for (const key of keys) await storage.put(key, new Uint8Array([1]));
    return {
        ...storage,
        list: (prefix, opts) => storage.list(prefix, { ...opts, limit: 2 }),
    };
}

/** Every key the driver still holds. */
async function remaining(storage: StorageDriver): Promise<string[]> {
    return listAll(storage, '');
}

describe('listAll', () => {
    it('follows the cursor across multiple pages', async () => {
        const storage = await pagedStorage([
            'v/a',
            'v/b',
            'v/c',
            'v/d',
            'v/e',
            'other/x',
        ]);
        const list = vi.spyOn(storage, 'list');

        expect(await listAll(storage, 'v/')).toEqual(['v/a', 'v/b', 'v/c', 'v/d', 'v/e']);
        // 3 pages: 2 + 2 + 1.
        expect(list.mock.calls.map(([, opts]) => opts?.cursor)).toEqual([
            undefined,
            'v/b',
            'v/d',
        ]);
    });

    it('returns an empty array when nothing matches', async () => {
        const storage = await pagedStorage(['other/x']);
        const list = vi.spyOn(storage, 'list');

        expect(await listAll(storage, 'v/')).toEqual([]);
        expect(list.mock.calls.map(([, opts]) => opts?.cursor)).toEqual([undefined]);
    });
});

describe('deletePrefix', () => {
    it('deletes every key under the prefix across multiple pages', async () => {
        const storage = await pagedStorage([
            'v/a',
            'v/b',
            'v/c',
            'v/d',
            'v/e',
            'other/x',
        ]);
        const list = vi.spyOn(storage, 'list');

        await deletePrefix(storage, 'v/');

        expect(await remaining(storage)).toEqual(['other/x']);
        expect(list.mock.calls.length).toBeGreaterThan(1);
    });

    it('leaves keys outside the prefix alone', async () => {
        const storage = await pagedStorage(['v/a', 'other/x']);

        await deletePrefix(storage, 'v/');

        expect(await remaining(storage)).toEqual(['other/x']);
    });

    it('is a no-op for an empty prefix listing', async () => {
        const storage = await pagedStorage(['other/x']);

        await deletePrefix(storage, 'v/');

        expect(await remaining(storage)).toEqual(['other/x']);
    });
});
