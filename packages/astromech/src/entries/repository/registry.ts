/**
 * Entry repository registry: a type resolves to its own repository when one is
 * mounted via `setEntryRepository`, else the shared built-in singleton. Both
 * registries live on `globalThis` — module-level state duplicates per bundle chunk.
 */

import type { EntryRepository } from './types';
import { createKeyedRegistry, createRegistry } from '@/registry';
import { createBuiltInEntryRepository } from './built-in';

const builtIn = createRegistry<EntryRepository>('entryRepositoryBuiltIn', {
    required: false,
});
const overrides = createKeyedRegistry<EntryRepository>('entryRepositoryOverrides');

/** The shared built-in repository, constructed on first use. */
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
 * True when a type has a repository of its own rather than the shared built-in one.
 * Callers that read the `entries` table directly (the relationships rebuild) use
 * it to tell which types have rows there at all.
 */
export function hasEntryRepositoryOverride(type: string): boolean {
    return overrides.has(type);
}

/**
 * Clear all per-type repository overrides. Called at the start of `registerPlugins`
 * so repeated registrations (notably in tests) don't leak stale plugin repositories.
 */
export function resetEntryRepositoryOverrides(): void {
    overrides.clear();
}
