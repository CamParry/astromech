/**
 * Query key factory for TanStack Query cache management.
 * All queryKey arrays should be created via this factory.
 */

export const queryKeys = {
    // Collections
    entries: {
        all: (collection: string) => ['entries', collection] as const,
        list: (collection: string, filters?: Record<string, unknown>) =>
            ['entries', collection, 'list', filters] as const,
        /**
         * One locale of one entry. An entry has a single id across its
         * locales, so the locale is part of the key: switching locale on the
         * edit page is a different query, not a stale one.
         */
        get: (collection: string, id: string, locale: string) =>
            ['entries', collection, 'detail', id, locale] as const,
        trashed: (collection: string) => ['entries', collection, 'trashed'] as const,
        versions: (collection: string, id: string, locale: string) =>
            ['entries', collection, 'versions', id, locale] as const,
        /** The staged change of one locale of an entry (forward versioning). */
        staged: (collection: string, id: string, locale: string) =>
            ['entries', collection, 'staged', id, locale] as const,
    },

    // Globals
    globals: {
        /** Everything cached for one global, across its locales. */
        all: (key: string) => ['globals', key] as const,
        /**
         * One locale of one global. A global is addressed by its key alone, so
         * the locale is the only thing separating two rows of it.
         */
        get: (key: string, locale: string) => ['globals', key, 'detail', locale] as const,
        versions: (key: string, locale: string) =>
            ['globals', key, 'versions', locale] as const,
        /** The staged change of one locale of a global (forward versioning). */
        staged: (key: string, locale: string) =>
            ['globals', key, 'staged', locale] as const,
    },

    // Media
    media: {
        all: () => ['media'] as const,
        list: (params: Record<string, unknown>) => ['media', 'list', params] as const,
        /** Everything cached for one media item, across its locales. */
        detailPrefix: (id: string) => ['media', 'detail', id] as const,
        /**
         * One locale of one media item. A read with no locale falls back to
         * the default locale's content, so `null` is its own cache entry.
         */
        detail: (id: string, locale?: string) =>
            ['media', 'detail', id, locale ?? null] as const,
        versions: (id: string, locale: string) =>
            ['media', 'detail', id, 'versions', locale] as const,
    },

    // Users
    users: {
        all: () => ['users'] as const,
        list: (params?: Record<string, unknown>) => ['users', 'list', params] as const,
        detail: (id: string) => ['users', 'detail', id] as const,
    },

    // Settings
    settings: {
        all: () => ['settings'] as const,
        detail: (key: string) => ['settings', 'detail', key] as const,
    },

    // Entry type metadata (schema/config)
    entryTypes: {
        all: () => ['entry-types-meta'] as const,
        detail: (name: string) => ['entry-types-meta', 'detail', name] as const,
    },

    // Notifications
    notifications: {
        all: () => ['notifications'] as const,
        list: (params?: Record<string, unknown>) =>
            ['notifications', 'list', params] as const,
        count: () => ['notifications', 'count'] as const,
    },
} as const;

/**
 * Cache-scope-aware entry query keys. Root types use scope `''`, producing
 * keys identical to `queryKeys.entries.*`; plugin types pass the plugin
 * name, prefixing a segment so a plugin type can't collide with a root one.
 */
export function scopedEntryKeys(cacheScope: string) {
    if (cacheScope === '') return queryKeys.entries;
    const prefix = ['plugin', cacheScope] as const;
    return {
        all: (collection: string) => [...prefix, 'entries', collection] as const,
        list: (collection: string, filters?: Record<string, unknown>) =>
            [...prefix, 'entries', collection, 'list', filters] as const,
        get: (collection: string, id: string, locale: string) =>
            [...prefix, 'entries', collection, 'detail', id, locale] as const,
        trashed: (collection: string) =>
            [...prefix, 'entries', collection, 'trashed'] as const,
        versions: (collection: string, id: string, locale: string) =>
            [...prefix, 'entries', collection, 'versions', id, locale] as const,
        staged: (collection: string, id: string, locale: string) =>
            [...prefix, 'entries', collection, 'staged', id, locale] as const,
    };
}

/**
 * Cache-scope-aware global query keys, the counterpart of `scopedEntryKeys`.
 * Host globals use scope `''` and get `queryKeys.globals.*`; a plugin's pass
 * the plugin name, so a plugin global cannot collide with a host one.
 */
export function scopedGlobalKeys(cacheScope: string) {
    if (cacheScope === '') return queryKeys.globals;
    const prefix = ['plugin', cacheScope] as const;
    return {
        all: (key: string) => [...prefix, 'globals', key] as const,
        get: (key: string, locale: string) =>
            [...prefix, 'globals', key, 'detail', locale] as const,
        versions: (key: string, locale: string) =>
            [...prefix, 'globals', key, 'versions', locale] as const,
        staged: (key: string, locale: string) =>
            [...prefix, 'globals', key, 'staged', locale] as const,
    };
}
