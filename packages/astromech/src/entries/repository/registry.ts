/**
 * Entry repository registry: a type resolves to its own repository when one is
 * mounted by `registerEntryRepositories`, else the shared entries-table repository. Both
 * registries live on `globalThis` — module-level state duplicates per bundle chunk.
 */

import type { EntryRepository } from './types';
import type { AstromechConfig } from '@/types/index';
import { declaredEntryTypes } from '@/config/entry-types';
import { createKeyedRegistry, createLazyRegistry } from '@/registry';
import { createEntriesTableRepository } from './entries-table';

/** The shared `entries` table's repository, with the reads only that table has. */
export type EntriesTableRepository = ReturnType<typeof createEntriesTableRepository>;

const entriesTable = createLazyRegistry<EntriesTableRepository>(
    'entriesTableRepository',
    createEntriesTableRepository
);
const overrides = createKeyedRegistry<EntryRepository>('entryRepositoryOverrides');

/** The repository `type`'s rows live in: its own when it names one, else the shared one. */
export function getEntryRepository(type: string): EntryRepository {
    return overrides.get(type) ?? entriesTable.get();
}

/**
 * The shared `entries` table's repository, whatever a type names. Code that
 * reads that table as a whole (preview tokens, the index rebuild) reaches it here.
 */
export function getEntriesTableRepository(): EntriesTableRepository {
    return entriesTable.get();
}

/**
 * Mount one type's repository by hand. Tests use it to swap in a failing one;
 * a site names its repository on the entry type instead.
 * @internal
 */
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
 * Mount the repository every declared entry type names, the site's and each
 * plugin's, under its id, after clearing the previous boot's.
 */
export function registerEntryRepositories(
    config: Pick<AstromechConfig, 'entries' | 'plugins'>
): void {
    overrides.clear();
    for (const { id, entryType } of declaredEntryTypes(config)) {
        if (entryType.repository) overrides.set(id, entryType.repository);
    }
}
