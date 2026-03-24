/**
 * Storage driver registry.
 *
 * Uses globalThis so the driver set during Astro's config:setup hook
 * (integration context) is visible to the server SDK at request time
 * (Vite SSR context) — both run in the same Node.js process.
 */

import type { StorageDriver } from '@/types/index.js';

declare global {
    // eslint-disable-next-line no-var
    var __astromechStorage: StorageDriver | undefined;
}

export function setStorageDriver(driver: StorageDriver): void {
    globalThis.__astromechStorage = driver;
}

export function getStorageDriver(): StorageDriver | null {
    return globalThis.__astromechStorage ?? null;
}
