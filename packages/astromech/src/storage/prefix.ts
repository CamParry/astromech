import type { StorageDriver } from '@/types/index';

/** Every key under a prefix, following the cursor. Prefer paginated `list` where you can. */
export async function listAll(driver: StorageDriver, prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor: string | undefined;
    do {
        const page = await driver.list(
            prefix,
            cursor !== undefined ? { cursor } : undefined
        );
        keys.push(...page.keys);
        cursor = page.cursor;
    } while (cursor !== undefined);
    return keys;
}

/** Delete every key under a prefix (paginated list + delete loop). Drivers don't reimplement this. */
export async function deletePrefix(driver: StorageDriver, prefix: string): Promise<void> {
    let cursor: string | undefined;
    do {
        const page = await driver.list(
            prefix,
            cursor !== undefined ? { cursor } : undefined
        );
        // Each page is deleted before the next is fetched, so a large prefix
        // never materialises in memory.
        await Promise.all(page.keys.map((k) => driver.delete(k)));
        cursor = page.cursor;
    } while (cursor !== undefined);
}
