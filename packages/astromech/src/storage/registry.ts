/**
 * Storage driver registry, globalThis-backed (see `@/registry.js`) so the
 * driver `initRuntime` sets is visible everywhere it's reached — module
 * state duplicates across the package's entry chunks otherwise.
 */

import type { StorageDriver } from '@/types/index';
import { createRegistry } from '@/registry';

const storage = createRegistry<StorageDriver>('storage', {
    hint: 'Set `storage` in your Astromech config.',
});

export const setStorageDriver = storage.set;

/** The configured storage driver. Throws when unset. */
export const getStorageDriver = storage.getOrThrow;
