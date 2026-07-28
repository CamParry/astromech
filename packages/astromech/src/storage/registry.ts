/**
 * Storage driver registry.
 *
 * globalThis-backed (see `@/utilities/registry.js`) so the driver set during
 * Astro's config:setup hook (integration context) is visible to the local
 * transport at request time (Vite SSR context) — both run in the same Node.js
 * process.
 */

import { defineRegistry } from '@/utilities/registry.js';
import type { StorageDriver } from '@/types/index.js';

const storage = defineRegistry<StorageDriver>('storage', {
    hint: 'Set `storage` in your Astromech config.',
});

export const setStorageDriver = storage.set;
export const getStorageDriver = storage.get;
