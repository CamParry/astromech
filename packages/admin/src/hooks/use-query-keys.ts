/**
 * The admin's one TanStack Query key factory. Entry and global keys take the
 * type or global id, bare or plugin-qualified, so a plugin's never collide.
 */

export const queryKeys = {
    entries: {
        /** Everything cached for one entry type; every entry mutation invalidates it. */
        all: (type: string) => ['entries', type] as const,
        list: (type: string, filters?: Record<string, unknown>) =>
            ['entries', type, 'list', filters] as const,
        /**
         * One locale of one entry. An entry has a single id across its
         * locales, so the locale is part of the key: switching locale on the
         * edit page is a different query, not a stale one.
         */
        get: (type: string, id: string, locale: string) =>
            ['entries', type, 'detail', id, locale] as const,
        versions: (type: string, id: string, locale: string) =>
            ['entries', type, 'versions', id, locale] as const,
        /** The staged change of one locale of an entry (forward versioning). */
        staged: (type: string, id: string, locale: string) =>
            ['entries', type, 'staged', id, locale] as const,
        /** What references one entry, from any resource. */
        usedBy: (type: string, id: string) => ['entries', type, 'used-by', id] as const,
    },

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

    media: {
        all: () => ['media'] as const,
        list: (params: Record<string, unknown>) => ['media', 'list', params] as const,
        /**
         * One locale of one media item. A read with no locale falls back to
         * the default locale's content, so `null` is its own cache entry.
         */
        detail: (id: string, locale?: string) =>
            ['media', 'detail', id, locale ?? null] as const,
        versions: (id: string, locale: string) =>
            ['media', 'detail', id, 'versions', locale] as const,
        /** What references one media item, from any resource. */
        usedBy: (id: string) => ['media', 'detail', id, 'used-by'] as const,
    },

    users: {
        all: () => ['users'] as const,
        list: (params?: Record<string, unknown>) => ['users', 'list', params] as const,
        /**
         * One locale of one user. A read with no locale falls back to the
         * default locale's content, so `null` is its own cache entry.
         */
        detail: (id: string, locale?: string) =>
            ['users', 'detail', id, locale ?? null] as const,
        versions: (id: string, locale: string) =>
            ['users', 'detail', id, 'versions', locale] as const,
    },

    notifications: {
        all: () => ['notifications'] as const,
        list: (params?: Record<string, unknown>) =>
            ['notifications', 'list', params] as const,
        count: () => ['notifications', 'count'] as const,
    },

    auth: {
        /** The signed-in user; route guards and the React tree share it. */
        session: () => ['session'] as const,
        /** Whether the install still needs first-run setup. */
        setupCheck: () => ['setup-check'] as const,
    },

    /** The command palette's search across the entry types it may read, users and media. */
    search: (query: string, types: readonly string[]) =>
        ['search', query, types] as const,
} as const;
