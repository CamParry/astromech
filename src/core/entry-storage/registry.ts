/**
 * Entry storage registry.
 *
 * Phase 2: every type resolves to the shared built-in singleton. Phase 3 mounts
 * per-type storages (e.g. tableStorage) via `setEntryStorage`. The singleton is
 * config-free; the orchestrator resolves locale defaults before dispatching, so
 * the built-in storage's own `defaultLocale` fallback ('en') is never relied on.
 */

import { BuiltInEntryStorage } from './built-in.js';
import type { EntryStorage } from './types.js';

let builtInSingleton: EntryStorage | undefined;
const overrides = new Map<string, EntryStorage>();

function getBuiltIn(): EntryStorage {
    if (!builtInSingleton) {
        builtInSingleton = new BuiltInEntryStorage();
    }
    return builtInSingleton;
}

export function getEntryStorage(type: string): EntryStorage {
    return overrides.get(type) ?? getBuiltIn();
}

export function setEntryStorage(type: string, storage: EntryStorage): void {
    overrides.set(type, storage);
}

/**
 * Clear all per-type storage overrides. Called at the start of `registerPlugins`
 * so repeated registrations (notably in tests) don't leak stale plugin storages.
 */
export function resetEntryStorageOverrides(): void {
    overrides.clear();
}
