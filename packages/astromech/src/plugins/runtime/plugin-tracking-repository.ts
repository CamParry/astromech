/**
 * Plugin-tracking repository — the only place Kysely touches `_astromech_plugins`.
 * Thin domain vocabulary over `createRepository(pluginsTable)`. Both callers
 * are best-effort: the try/catch stays at the call site in `plugin-runtime.ts`.
 */

import type { Db } from '@/database/types';
import { createRepository } from '@/database/repository/create-repository';
import { pluginsTable } from '@/database/tables';

export type PluginTrackingRepository = ReturnType<typeof createPluginTrackingRepository>;

/** Defaults to the registered db; pass a tx handle to scope it to a transaction. */
export function createPluginTrackingRepository(db?: Db) {
    const repository = createRepository(pluginsTable, db);

    /**
     * Record the plugin, refreshing only `namespace` and `version` if already
     * tracked. `installedAt` is absent from both value sets — `defaultNow` fills
     * the insert and no `onUpdate` means nothing re-stamps it on a later boot.
     */
    async function track(pkg: string, namespace: string, version: string): Promise<void> {
        await repository.upsert(
            { package: pkg, namespace, version },
            { target: ['package'], set: { namespace, version } }
        );
    }

    /** Every tracked package — the input to the removed-plugin diff. */
    async function packages(): Promise<string[]> {
        const rows = await repository.findMany();
        return rows.map((row) => row.package);
    }

    return { track, packages };
}
