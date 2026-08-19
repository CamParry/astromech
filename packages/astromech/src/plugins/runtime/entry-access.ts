/**
 * Entry-access port (dependency inversion).
 *
 * The plugin runtime is a capability and must not import the `entries` domain
 * directly (that would make the DAG cyclic: entries → runtime for hooks, runtime
 * → entries for type qualification/storage). Instead the runtime declares the
 * narrow slice of entries behaviour it needs as a port, and the entries domain
 * injects the implementation at boot via `registerEntryAccess` (see
 * `@/entries/plugin-access`).
 *
 * The implementation lives in a registry slot so it survives the package's
 * multiple bundle entry points.
 */

import type { EntryType } from '@/types/index';
import { createRegistry } from '@/utilities/registry';

export type EntryAccess = {
    /**
     * Qualify a plugin's bare entry-type id: `(name, 'redirect') → 'name/redirect'`.
     * Called only while REGISTERING a plugin's own declared entry types, where
     * the type is resolvable by construction — it is not an addressing helper.
     */
    qualifyEntryType(plugin: string, type: string): string;
    /** Mount a per-type storage override under its qualified id. */
    setEntryStorage(
        qualifiedId: string,
        storage: NonNullable<EntryType['storage']>
    ): void;
    /** Drop all per-type storage overrides (re-run safe). */
    resetEntryStorageOverrides(): void;
};

const access = createRegistry<EntryAccess>('entryAccess', {
    hint:
        'The entries domain must call registerEntryAccess() (via @/entries/plugin-access) ' +
        'before the plugin runtime mounts plugins.',
});

/** Inject the entries-domain implementation. Called once at boot, idempotent. */
export function registerEntryAccess(implementation: EntryAccess): void {
    access.set(implementation);
}

/** The injected entry access, or crash-loud if the entries domain wasn't wired. */
export function entryAccess(): EntryAccess {
    return access.get();
}
