/**
 * Plugin-tracking storage — the only place Kysely touches `_astromech_plugins`.
 *
 * Thin domain vocabulary over `createStorage(pluginsTable)`, which owns encoding,
 * value serialization and row decoding. Both callers are best-effort: the table
 * may not exist in odd dev states, so the try/catch stays at the call site in
 * `plugin-runtime.ts`, next to the warning text that explains the failure.
 */

import type { Db } from '@/database/types';
import { createStorage } from '@/database/storage/create-storage';
import { pluginsTable } from '@/database/tables';

export type PluginTrackingStorage = ReturnType<typeof createPluginTrackingStorage>;

/** Defaults to the registered db; pass a tx handle to scope it to a transaction. */
export function createPluginTrackingStorage(db?: Db) {
    const storage = createStorage(pluginsTable, db);

    /**
     * Record the plugin, refreshing only `namespace` and `version` if it is
     * already tracked. `installedAt` is deliberately absent from both value sets:
     * the table gives it `defaultNow` (which fills the insert) and no
     * `onUpdate`, so nothing re-stamps the original install time on a later boot.
     */
    async function track(pkg: string, namespace: string, version: string): Promise<void> {
        await storage.upsert(
            { package: pkg, namespace, version },
            { target: ['package'], set: { namespace, version } }
        );
    }

    /** Every tracked package — the input to the removed-plugin diff. */
    async function packages(): Promise<string[]> {
        const rows = await storage.findMany();
        return rows.map((row) => row.package);
    }

    return { track, packages };
}
