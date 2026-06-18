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
        get: (collection: string, id: string) =>
            ['entries', collection, 'detail', id] as const,
        trashed: (collection: string) => ['entries', collection, 'trashed'] as const,
        versions: (collection: string, id: string) =>
            ['entries', collection, 'versions', id] as const,
        translations: (collection: string, id: string) =>
            ['entries', collection, 'translations', id] as const,
    },

    // Media
    media: {
        all: () => ['media'] as const,
        list: (params: Record<string, unknown>) => ['media', 'list', params] as const,
        detail: (id: string) => ['media', 'detail', id] as const,
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
        unreadCount: () => ['notifications', 'unread-count'] as const,
    },
} as const;

/**
 * Cache-scope-aware entry query keys.
 *
 * Root types use scope `''`, which produces keys byte-identical to
 * `queryKeys.entries.*` so existing invalidations keep working unchanged.
 * Plugin types pass the plugin name as the scope, which prefixes a
 * disambiguating segment so a plugin `redirect` type can't collide with a
 * root `redirect` type in the cache.
 */
export function scopedEntryKeys(cacheScope: string) {
    if (cacheScope === '') return queryKeys.entries;
    const prefix = ['plugin', cacheScope] as const;
    return {
        all: (collection: string) => [...prefix, 'entries', collection] as const,
        list: (collection: string, filters?: Record<string, unknown>) =>
            [...prefix, 'entries', collection, 'list', filters] as const,
        get: (collection: string, id: string) =>
            [...prefix, 'entries', collection, 'detail', id] as const,
        trashed: (collection: string) =>
            [...prefix, 'entries', collection, 'trashed'] as const,
        versions: (collection: string, id: string) =>
            [...prefix, 'entries', collection, 'versions', id] as const,
        translations: (collection: string, id: string) =>
            [...prefix, 'entries', collection, 'translations', id] as const,
    };
}
