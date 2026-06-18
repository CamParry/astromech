import type { StorageDriver } from '@/types/index.js';

/** Delete every key under a prefix (list + delete loop). Drivers don't reimplement this. */
export async function deletePrefix(driver: StorageDriver, prefix: string): Promise<void> {
    const keys = await driver.list(prefix);
    await Promise.all(keys.map((k) => driver.delete(k)));
}
