import type { StorageDriver, StorageList } from '@/types/index';
import { describe, expect, it } from 'vitest';
import { deletePrefix, listAll } from '@/storage/prefix';

// Paginating fake driver — `list` never returns more than `pageSize` keys and
// hands back a cursor while more remain.

function makePagedDriver(
    keys: string[],
    pageSize: number
): StorageDriver & { deleted: string[]; listCalls: { cursor?: string }[] } {
    const store = new Set(keys);
    const deleted: string[] = [];
    const listCalls: { cursor?: string }[] = [];

    return {
        name: 'paged',
        deleted,
        listCalls,
        async put(): Promise<void> {
            return undefined;
        },
        async get(): Promise<null> {
            return null;
        },
        async stat(): Promise<null> {
            return null;
        },
        async delete(key: string): Promise<void> {
            deleted.push(key);
            store.delete(key);
        },
        async list(
            prefix: string,
            opts?: { cursor?: string; limit?: number }
        ): Promise<StorageList> {
            const cursor = opts?.cursor;
            listCalls.push(cursor !== undefined ? { cursor } : {});
            const all = [...store].filter((k) => k.startsWith(prefix)).sort();
            const remaining = cursor === undefined ? all : all.filter((k) => k > cursor);
            const page = remaining.slice(0, opts?.limit ?? pageSize);
            const last = page.at(-1);
            if (remaining.length > page.length && last !== undefined) {
                return { keys: page, cursor: last };
            }
            return { keys: page };
        },
    };
}

describe('listAll', () => {
    it('follows the cursor across multiple pages', async () => {
        const driver = makePagedDriver(['v/a', 'v/b', 'v/c', 'v/d', 'v/e', 'other/x'], 2);

        expect(await listAll(driver, 'v/')).toEqual(['v/a', 'v/b', 'v/c', 'v/d', 'v/e']);
        // 3 pages: 2 + 2 + 1.
        expect(driver.listCalls).toEqual([{}, { cursor: 'v/b' }, { cursor: 'v/d' }]);
    });

    it('returns an empty array when nothing matches', async () => {
        const driver = makePagedDriver(['other/x'], 2);
        expect(await listAll(driver, 'v/')).toEqual([]);
        expect(driver.listCalls).toEqual([{}]);
    });
});

describe('deletePrefix', () => {
    it('deletes every key under the prefix across multiple pages', async () => {
        const driver = makePagedDriver(['v/a', 'v/b', 'v/c', 'v/d', 'v/e', 'other/x'], 2);

        await deletePrefix(driver, 'v/');

        expect(driver.deleted.sort()).toEqual(['v/a', 'v/b', 'v/c', 'v/d', 'v/e']);
        expect(driver.listCalls.length).toBeGreaterThan(1);
    });

    it('leaves keys outside the prefix alone', async () => {
        const driver = makePagedDriver(['v/a', 'other/x'], 2);
        await deletePrefix(driver, 'v/');
        expect(driver.deleted).toEqual(['v/a']);
    });

    it('is a no-op for an empty prefix listing', async () => {
        const driver = makePagedDriver(['other/x'], 2);
        await deletePrefix(driver, 'v/');
        expect(driver.deleted).toEqual([]);
    });
});
