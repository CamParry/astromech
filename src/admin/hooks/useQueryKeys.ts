/**
 * Query key factory for TanStack Query cache management.
 * All queryKey arrays should be created via this factory.
 */

export const queryKeys = {
    // Collections
    entities: {
        all: (collection: string) => ['entities', collection] as const,
        list: (collection: string, filters?: Record<string, unknown>) =>
            ['entities', collection, 'list', filters] as const,
        detail: (collection: string, id: string) =>
            ['entities', collection, 'detail', id] as const,
        trashed: (collection: string) => ['entities', collection, 'trashed'] as const,
        versions: (collection: string, id: string) =>
            ['entities', collection, 'versions', id] as const,
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
        detail: (id: string) => ['users', 'detail', id] as const,
    },

    // Settings
    settings: {
        all: () => ['settings'] as const,
        detail: (key: string) => ['settings', 'detail', key] as const,
    },

    // Collections metadata (schema/config)
    collections: {
        all: () => ['collections-meta'] as const,
        detail: (name: string) => ['collections-meta', 'detail', name] as const,
    },
} as const;
