/**
 * Entry-access port (dependency inversion).
 *
 * The plugin runtime is a capability and must not import the `entries` domain
 * directly (that would make the DAG cyclic: entries → runtime for hooks, runtime
 * → entries for scoping/storage). Instead the runtime declares the narrow slice
 * of entries behaviour it needs as a port, and the entries domain injects the
 * implementation at boot via `registerEntryAccess` (see `@/entries/plugin-access`).
 *
 * State lives on globalThis (like the other registries) so it survives the
 * package's multiple bundle entry points.
 */

import type { EntriesApi, EntryTypeConfig } from '@/types/index.js';

export type EntryAccess = {
    /** Qualify a plugin's bare entry-type id: `(name, 'redirect') → 'name/redirect'`. */
    qualifyEntryType(plugin: string, type: string): string;
    /** Wrap an EntriesApi so a plugin addresses its own types by their bare keys. */
    createScopedEntries(pluginName: string, api: EntriesApi): EntriesApi;
    /** Mount a per-type storage override under its qualified id. */
    setEntryStorage(
        qualifiedId: string,
        storage: NonNullable<EntryTypeConfig['storage']>
    ): void;
    /** Drop all per-type storage overrides (re-run safe). */
    resetEntryStorageOverrides(): void;
};

declare global {
    var __astromechEntryAccess: EntryAccess | undefined;
}

/** Inject the entries-domain implementation. Called once at boot, idempotent. */
export function registerEntryAccess(access: EntryAccess): void {
    globalThis.__astromechEntryAccess = access;
}

/** The injected entry access, or crash-loud if the entries domain wasn't wired. */
export function entryAccess(): EntryAccess {
    const access = globalThis.__astromechEntryAccess;
    if (!access) {
        throw new Error(
            '[Astromech] Entry access is not registered. The entries domain must call ' +
                'registerEntryAccess() (via @/entries/plugin-access) before the plugin runtime ' +
                'mounts plugins.'
        );
    }
    return access;
}
