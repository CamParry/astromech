/**
 * Entry storage registry.
 *
 * Phase 2: every type resolves to the shared built-in singleton. Phase 3 mounts
 * per-type storages (e.g. tableStorage) via `setEntryStorage`. The singleton is
 * config-free; the entries service resolves locale defaults before dispatching, so
 * the built-in storage's own `defaultLocale` fallback ('en') is never relied on.
 *
 * State lives on globalThis (mirrors the db/storage-driver registries): the
 * package has multiple bundle entry points (core, adapters, plugin subpaths),
 * so module-level state can be duplicated per chunk — `registerPlugins` would
 * write overrides into one copy while the entries service reads another.
 */

import { createBuiltInEntryStorage } from './built-in.js';
import type { EntryStorage } from './types.js';

type EntryStorageRegistry = {
    builtIn: EntryStorage | undefined;
    overrides: Map<string, EntryStorage>;
};

declare global {
    var __astromechEntryStorage: EntryStorageRegistry | undefined;
}

function registry(): EntryStorageRegistry {
    if (!globalThis.__astromechEntryStorage) {
        globalThis.__astromechEntryStorage = {
            builtIn: undefined,
            overrides: new Map<string, EntryStorage>(),
        };
    }
    return globalThis.__astromechEntryStorage;
}

function getBuiltIn(): EntryStorage {
    const state = registry();
    if (!state.builtIn) {
        state.builtIn = createBuiltInEntryStorage();
    }
    return state.builtIn;
}

export function getEntryStorage(type: string): EntryStorage {
    return registry().overrides.get(type) ?? getBuiltIn();
}

export function setEntryStorage(type: string, storage: EntryStorage): void {
    registry().overrides.set(type, storage);
}

/**
 * Clear all per-type storage overrides. Called at the start of `registerPlugins`
 * so repeated registrations (notably in tests) don't leak stale plugin storages.
 */
export function resetEntryStorageOverrides(): void {
    registry().overrides.clear();
}
