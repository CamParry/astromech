/**
 * Plugin-tracking storage — the only place Kysely touches `_astromech_plugins`.
 *
 * Thin domain vocabulary over `createStorage(plugins)`, which owns encoding,
 * value serialization and row decoding. Both callers are best-effort: the table
 * may not exist in odd dev states, so the try/catch stays at the call site in
 * `plugin-runtime.ts`, next to the warning text that explains the failure.
 */

import { createStorage } from '@/database/storage/create-storage.js';
import { plugins } from '@/database/schema.js';
import type { Db } from '@/database/types.js';

export type PluginTrackingStorage = ReturnType<typeof createPluginTrackingStorage>;

/** Defaults to the registered db; pass a tx handle to scope it to a transaction. */
export function createPluginTrackingStorage(db?: Db) {
    const storage = createStorage(plugins, db);

    /**
     * Record the plugin, refreshing only `namespace` and `version` if it is
     * already tracked. `installedAt` is deliberately absent from both value sets:
     * the descriptor gives it `defaultNow` (which fills the insert) and no
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
