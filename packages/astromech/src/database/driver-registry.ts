/**
 * Database Driver Registry
 *
 * Retains the full driver object (including optional dump/restore) so
 * plugins can feature-detect capabilities at runtime. Mirrors the storage
 * registry pattern.
 */

import type { DatabaseDriver } from '@/types/index.js';

declare global {
    var __astromechDbDriver: DatabaseDriver | undefined;
}

export function setDatabaseDriver(driver: DatabaseDriver): void {
    globalThis.__astromechDbDriver = driver;
}

export function getDatabaseDriver(): DatabaseDriver | null {
    return globalThis.__astromechDbDriver ?? null;
}
