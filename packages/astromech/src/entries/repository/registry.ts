/**
 * Entry storage registry.
 *
 * A type resolves to its own storage when one is mounted via `setEntryRepository`
 * (a table-backed type mounts `tableRepository`), and to the shared built-in
 * singleton otherwise. The singleton is config-free; the entries service resolves
 * locale defaults before dispatching, so the built-in storage's own
 * `defaultLocale` fallback ('en') is never relied on.
 *
 * Both registries live in the shared `globalThis` namespace: the package has multiple
 * bundle entry points (core, adapters, plugin subpaths), so module-level state
 * can be duplicated per chunk — `registerPlugins` would write overrides into one
 * copy while the entries service reads another.
 */

import type { EntryRepository } from './types';
import { createKeyedRegistry, createRegistry } from '@/registry';
import { createBuiltInEntryRepository } from './built-in';

const builtIn = createRegistry<EntryRepository>('entryRepositoryBuiltIn', {
    required: false,
});
const overrides = createKeyedRegistry<EntryRepository>('entryRepositoryOverrides');

/** The shared built-in storage, constructed on first use. */
function getBuiltIn(): EntryRepository {
    const existing = builtIn.get();
    if (existing) return existing;
    const created = createBuiltInEntryRepository();
    builtIn.set(created);
    return created;
}

export function getEntryRepository(type: string): EntryRepository {
    return overrides.get(type) ?? getBuiltIn();
}

export function setEntryRepository(type: string, repository: EntryRepository): void {
    overrides.set(type, repository);
}

/**
 * True when a type has a storage of its own rather than the shared built-in one.
 * Callers that read the `entries` table directly (the relationships rebuild) use
 * it to tell which types have rows there at all.
 */
export function hasEntryRepositoryOverride(type: string): boolean {
    return overrides.has(type);
}

/**
 * Clear all per-type storage overrides. Called at the start of `registerPlugins`
 * so repeated registrations (notably in tests) don't leak stale plugin storages.
 */
export function resetEntryRepositoryOverrides(): void {
    overrides.clear();
}
