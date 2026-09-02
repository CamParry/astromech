/**
 * `withDefaultShape(entries, shape)` wraps an `EntriesService` so `query`/`get`
 * inject `full: true` when the caller didn't ask — an explicit per-call value
 * always wins. `withDefaultGlobalsShape` and `withDefaultSettingsShape` do the
 * same for globals and settings.
 */

import type { EntriesService, GlobalsService, SettingsService } from '@/types/index';

/**
 * Return a thin wrapper around `entries` that injects `full: true` into
 * `query()`/`get()` when the caller didn't specify `full`. Mutation methods
 * are forwarded unchanged.
 */
export function withDefaultShape(
    entries: EntriesService,
    shape: 'full' | 'public'
): EntriesService {
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
        update: ((params: Parameters<EntriesService['update']>[0]) =>
            entries.update(params)) as EntriesService['update'],
        duplicate: (params) => entries.duplicate(params),
        trash: (params) => entries.trash(params),
        restore: ((params: Parameters<EntriesService['restore']>[0]) =>
            entries.restore(params)) as EntriesService['restore'],
        delete: (params) => entries.delete(params),
        emptyTrash: (params) => entries.emptyTrash(params),
        versions: (params) => entries.versions(params),
        restoreVersion: (params) => entries.restoreVersion(params),
        publish: ((params: Parameters<EntriesService['publish']>[0]) =>
            entries.publish(params)) as EntriesService['publish'],
        unpublish: ((params: Parameters<EntriesService['unpublish']>[0]) =>
            entries.unpublish(params)) as EntriesService['unpublish'],
        schedule: ((params: Parameters<EntriesService['schedule']>[0]) =>
            entries.schedule(params)) as EntriesService['schedule'],
        incomingRelationships: (params) => entries.incomingRelationships(params),
        createStaged: (params) => entries.createStaged(params),
        getStaged: (params) => entries.getStaged(params),
        mergeStaged: (params) => entries.mergeStaged(params),
        deleteStaged: (params) => entries.deleteStaged(params),
        issuePreviewToken: (params) => entries.issuePreviewToken(params),
        revokePreviewToken: (params) => entries.revokePreviewToken(params),
    };
}

/**
 * Return a thin wrapper around `globals` that injects `full: true` into `get()`
 * when the caller didn't specify `full` — `get` is the only global method with a
 * shape axis. Every other method is forwarded unchanged.
 */
export function withDefaultGlobalsShape(
    globals: GlobalsService,
    shape: 'full' | 'public'
): GlobalsService {
    if (shape === 'public') return globals;

    return {
        get(params) {
            if ('full' in params) return globals.get(params);
            return globals.get({ ...params, full: true });
        },
        update: (params) => globals.update(params),
        publish: (params) => globals.publish(params),
        unpublish: (params) => globals.unpublish(params),
        schedule: (params) => globals.schedule(params),
        versions: (params) => globals.versions(params),
        restoreVersion: (params) => globals.restoreVersion(params),
        createStaged: (params) => globals.createStaged(params),
        getStaged: (params) => globals.getStaged(params),
        mergeStaged: (params) => globals.mergeStaged(params),
        deleteStaged: (params) => globals.deleteStaged(params),
    };
}

/**
 * Return a thin wrapper around `settings` that injects `full: true` into
 * `all()`/`get()` when the caller didn't specify `full` — settings are
 * private by default. `set` is forwarded unchanged.
 */
export function withDefaultSettingsShape(
    settings: SettingsService,
    shape: 'full' | 'public'
): SettingsService {
    if (shape === 'public') return settings;

    return {
        all(params) {
            if (params && 'full' in params) return settings.all(params);
            return settings.all({ ...params, full: true });
        },
        get(params) {
            if ('full' in params) return settings.get(params);
            return settings.get({ ...params, full: true });
        },
        set: (params) => settings.set(params),
    };
}
