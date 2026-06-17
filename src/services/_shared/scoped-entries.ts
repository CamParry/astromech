/**
 * Plugin-scoped entries wrapper.
 *
 * `createScopedEntries(name, api)` returns an `EntriesApi` that auto-qualifies
 * bare type ids to the plugin's namespace (`{name}/{type}`) before delegating to
 * the underlying API. A plugin addresses its own entry types by their bare keys
 * (`'redirect'`) and never sees the qualified id. No permission checks — this is
 * the server-side plugin altitude (`ctx.entries`).
 */

import type { EntriesApi } from '@/types/index.js';
import { qualifyEntryType } from '@/support/entry-types.js';

type WithType = { type: string };

export function createScopedEntries(pluginName: string, entries: EntriesApi): EntriesApi {
    const q = (type: string): string => qualifyEntryType(pluginName, type);

    /** Qualify a single `type` param. */
    const mapType = <P extends WithType>(params: P): P => ({
        ...params,
        type: q(params.type),
    });

    return {
        query(params) {
            const typeParam = params.type;
            const type = Array.isArray(typeParam)
                ? typeParam.map(q)
                : q(typeParam as string);
            return entries.query({ ...params, type });
        },
        get: (params) => entries.get(mapType(params)),
        create: (params) => entries.create(mapType(params)),
        update: ((params: Parameters<EntriesApi['update']>[0]) =>
            entries.update(mapType(params))) as EntriesApi['update'],
        duplicate: (params) => entries.duplicate(mapType(params)),
        trash: (params) => entries.trash(mapType(params)),
        restore: ((params: Parameters<EntriesApi['restore']>[0]) =>
            entries.restore(mapType(params))) as EntriesApi['restore'],
        delete: (params) => entries.delete(mapType(params)),
        emptyTrash: (params) => entries.emptyTrash(mapType(params)),
        versions: (params) => entries.versions(mapType(params)),
        restoreVersion: (params) => entries.restoreVersion(mapType(params)),
        publish: ((params: Parameters<EntriesApi['publish']>[0]) =>
            entries.publish(mapType(params))) as EntriesApi['publish'],
        unpublish: ((params: Parameters<EntriesApi['unpublish']>[0]) =>
            entries.unpublish(mapType(params))) as EntriesApi['unpublish'],
        schedule: ((params: Parameters<EntriesApi['schedule']>[0]) =>
            entries.schedule(mapType(params))) as EntriesApi['schedule'],
        incomingRelations: (params) => entries.incomingRelations(mapType(params)),
    };
}
