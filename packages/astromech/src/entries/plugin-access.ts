/**
 * Injects the entries-domain implementation into the plugin runtime's
 * entry-access port (dependency inversion — see
 * `@/plugins/runtime/entry-access`).
 *
 * Exposed as an explicit `wireEntryAccess()` CALL rather than an import
 * side-effect: the package is `sideEffects: false`, so a bare
 * `import './plugin-access.js'` would be tree-shaken out of the build and the
 * port would never register. The composition root calls this once before
 * `registerPlugins`.
 *
 * Deliberately SERVICE-FREE (no `virtual:astromech/config`, no
 * `entries/service`) so the Astro integration — which loads in plain Node at
 * config time — can wire it without dragging the entries service into its graph.
 */

import { registerEntryAccess } from '@/plugins/runtime/entry-access.js';
import { qualifyEntryType } from './type-registry.js';
import { createScopedEntries } from './scoped-entries.js';
import { setEntryStorage, resetEntryStorageOverrides } from './storage/registry.js';

/** Wire the entries implementation into the plugin runtime. Idempotent. */
export function wireEntryAccess(): void {
    registerEntryAccess({
        qualifyEntryType,
        createScopedEntries,
        setEntryStorage,
        resetEntryStorageOverrides,
    });
}
