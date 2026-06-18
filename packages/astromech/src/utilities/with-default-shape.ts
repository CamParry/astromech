/**
 * `withDefaultShape(entries, shape)` — wrap an EntriesApi so that read calls
 * (`query` / `get`) inject `full: true` when the caller did NOT explicitly
 * supply a `full` key. An explicit per-call value always wins.
 *
 * Used to give privileged handles (hook context `ctx.entries`, admin fetch
 * client) a default of `full` while leaving the bare `Astromech.entries`
 * default at `public` (absent `full` ⇒ public, per spec §7.1).
 */

import type { EntriesApi } from '@/types/index.js';

/**
 * Return a thin wrapper around `entries` that injects `full: true` into
 * `query()` and `get()` calls where the caller did not specify `full`.
 *
 * All mutation methods (`create`, `update`, `delete`, …) are forwarded
 * unchanged — mutations are always full/trusted and carry no shape flag.
 */
export function withDefaultShape(
    entries: EntriesApi,
    shape: 'full' | 'public'
): EntriesApi {
    if (shape === 'public') {
        // public is already the server default — no wrapping needed.
        return entries;
    }

    // shape === 'full': inject full:true when absent from read calls.
    return {
        query(params) {
            if ('full' in params) return entries.query(params);
            return entries.query({ ...params, full: true });
        },
        get(params) {
            if ('full' in params) return entries.get(params);
            return entries.get({ ...params, full: true });
        },
        // Mutations + all other methods pass through unchanged.
        create: (params) => entries.create(params),
        update: ((params: Parameters<EntriesApi['update']>[0]) =>
            entries.update(params)) as EntriesApi['update'],
        duplicate: (params) => entries.duplicate(params),
        trash: (params) => entries.trash(params),
        restore: ((params: Parameters<EntriesApi['restore']>[0]) =>
            entries.restore(params)) as EntriesApi['restore'],
        delete: (params) => entries.delete(params),
        emptyTrash: (params) => entries.emptyTrash(params),
        versions: (params) => entries.versions(params),
        restoreVersion: (params) => entries.restoreVersion(params),
        publish: ((params: Parameters<EntriesApi['publish']>[0]) =>
            entries.publish(params)) as EntriesApi['publish'],
        unpublish: ((params: Parameters<EntriesApi['unpublish']>[0]) =>
            entries.unpublish(params)) as EntriesApi['unpublish'],
        schedule: ((params: Parameters<EntriesApi['schedule']>[0]) =>
            entries.schedule(params)) as EntriesApi['schedule'],
        incomingRelations: (params) => entries.incomingRelations(params),
    };
}
