/**
 * Storage driver registry.
 *
 * globalThis-backed (see `@/utilities/registry.js`) so the driver `initRuntime`
 * sets is visible to the local transport however it was reached — module-scope
 * state duplicates across the package's entry chunks.
 */

import { createRegistry } from '@/utilities/registry';
import type { StorageDriver } from '@/types/index';

const storage = createRegistry<StorageDriver>('storage', {
    hint: 'Set `storage` in your Astromech config.',
});

export const setStorageDriver = storage.set;
export const getStorageDriver = storage.get;
