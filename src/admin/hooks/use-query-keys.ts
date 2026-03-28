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
        detail: (collection: string, id: string) =>
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
} as const;
