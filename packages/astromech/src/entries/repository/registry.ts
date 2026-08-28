/**
 * Entry repository registry: a type resolves to its own repository when one is
 * mounted via `setEntryRepository`, else the shared entries-table repository. Both
 * registries live on `globalThis` — module-level state duplicates per bundle chunk.
 */

import type { EntryRepository } from './types';
import { createKeyedRegistry, createRegistry } from '@/registry';
import { createEntriesTableRepository } from './entries-table';

const entriesTable = createRegistry<EntryRepository>('entriesTableRepository', {
    required: false,
});
const overrides = createKeyedRegistry<EntryRepository>('entryRepositoryOverrides');

/** The shared entries-table repository, constructed on first use. */
function getEntriesTable(): EntryRepository {
    const existing = entriesTable.get();
    if (existing) return existing;
    const created = createEntriesTableRepository();
    entriesTable.set(created);
    return created;
}

export function getEntryRepository(type: string): EntryRepository {
    return overrides.get(type) ?? getEntriesTable();
}

export function setEntryRepository(type: string, repository: EntryRepository): void {
    overrides.set(type, repository);
}

/**
 * True when a type has rows outside the shared `entries` table — its own custom
 * table via `tableRepository`. Callers that read the `entries` table directly
 * (the relationships rebuild) use it to tell which types have rows there at all.
 */
export function hasCustomTable(type: string): boolean {
    return overrides.has(type);
}

/**
 * Clear all per-type repository overrides. Called at the start of `registerPlugins`
 * so repeated registrations (notably in tests) don't leak stale plugin repositories.
 */
export function resetEntryRepositoryOverrides(): void {
    overrides.clear();
}
