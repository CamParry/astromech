/**
 * `withDefaultShape(entries, shape)` — wrap an EntriesService so that read calls
 * (`query` / `get`) inject `full: true` when the caller did NOT explicitly
 * supply a `full` key. An explicit per-call value always wins.
 *
 * Used to give privileged handles (hook context `ctx.entries`, admin fetch
 * client) a default of `full` while leaving the bare `Astromech.entries`
 * default at `public` (absent `full` ⇒ public, per spec §7.1).
 *
 * `withDefaultSettingsShape` does the same for the other domain that carries a
 * shape axis, so plugin altitude is `full` consistently across both rather than
 * only where a call site remembered to ask.
 */

import type { EntriesService, SettingsService } from '@/types/index.js';

/**
 * Return a thin wrapper around `entries` that injects `full: true` into
 * `query()` and `get()` calls where the caller did not specify `full`.
 *
 * All mutation methods (`create`, `update`, `delete`, …) are forwarded
 * unchanged — mutations are always full/trusted and carry no shape flag.
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
        incomingRelations: (params) => entries.incomingRelations(params),
        createStaged: (params) => entries.createStaged(params),
        getStaged: (params) => entries.getStaged(params),
        mergeStaged: (params) => entries.mergeStaged(params),
        deleteStaged: (params) => entries.deleteStaged(params),
        issuePreviewToken: (params) => entries.issuePreviewToken(params),
        revokePreviewToken: (params) => entries.revokePreviewToken(params),
    };
}

/**
 * Return a thin wrapper around `settings` that injects `full: true` into
 * `all()` and `get()` calls where the caller did not specify `full`. Settings
 * are private by default, so without this a trusted caller silently reads
 * `null` for its own private keys.
 *
 * `set` is forwarded unchanged — writes carry no shape flag.
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
