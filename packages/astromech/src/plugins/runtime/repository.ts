/**
 * Plugin-tracking repository: the only place Kysely touches `_astromech_plugins`.
 * Both callers are best-effort: the try/catch stays at the call site in
 * `plugin-runtime.ts`.
 */

import { createRepository } from '@/database/repository/create-repository';
import { pluginsTable } from '@/database/tables';

export type PluginTrackingRepository = ReturnType<typeof createPluginTrackingRepository>;

function createPluginTrackingRepository() {
    const repository = createRepository(pluginsTable);

    /**
     * Record the plugin, refreshing only `namespace` and `version` if already
     * tracked. `installedAt` is absent from both value sets: `defaultNow` fills
     * the insert and no `onUpdate` means nothing re-stamps it on a later boot.
     */
    async function upsert(
        pkg: string,
        namespace: string,
        version: string
    ): Promise<void> {
        await repository.upsert(
            { package: pkg, namespace, version },
            { target: ['package'], set: { namespace, version } }
        );
    }

    /** Every tracked package, the input to the removed-plugin diff. */
    async function findPackages(): Promise<string[]> {
        const rows = await repository.findMany();
        return rows.map((row) => row.package);
    }

    return { upsert, findPackages };
}

/** The plugin-tracking repository. Stateless: the db handle resolves per call. */
export const pluginTrackingRepository = createPluginTrackingRepository();
