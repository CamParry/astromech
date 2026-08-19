/**
 * Entry storage registry.
 *
 * A type resolves to its own storage when one is mounted via `setEntryStorage`
 * (a table-backed type mounts `tableStorage`), and to the shared built-in
 * singleton otherwise. The singleton is config-free; the entries service resolves
 * locale defaults before dispatching, so the built-in storage's own
 * `defaultLocale` fallback ('en') is never relied on.
 *
 * Both slots live in the shared `globalThis` namespace: the package has multiple
 * bundle entry points (core, adapters, plugin subpaths), so module-level state
 * can be duplicated per chunk — `registerPlugins` would write overrides into one
 * copy while the entries service reads another.
 */

import type { EntryStorage } from './types';
import { createKeyedRegistry, createRegistry } from '@/utilities/registry';
import { createBuiltInEntryStorage } from './built-in';

const builtIn = createRegistry<EntryStorage>('entryStorageBuiltIn', { required: false });
const overrides = createKeyedRegistry<EntryStorage>('entryStorageOverrides');

/** The shared built-in storage, constructed on first use. */
function getBuiltIn(): EntryStorage {
    const existing = builtIn.peek();
    if (existing) return existing;
    const created = createBuiltInEntryStorage();
    builtIn.set(created);
    return created;
}

export function getEntryStorage(type: string): EntryStorage {
    return overrides.peek(type) ?? getBuiltIn();
}

export function setEntryStorage(type: string, storage: EntryStorage): void {
    overrides.set(type, storage);
}

/**
 * True when a type has a storage of its own rather than the shared built-in one.
 * Callers that read the `entries` table directly (the relationships rebuild) use
 * it to tell which types have rows there at all.
 */
export function hasEntryStorageOverride(type: string): boolean {
    return overrides.has(type);
}

/**
 * Clear all per-type storage overrides. Called at the start of `registerPlugins`
 * so repeated registrations (notably in tests) don't leak stale plugin storages.
 */
export function resetEntryStorageOverrides(): void {
    overrides.clear();
}
