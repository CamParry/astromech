/**
 * Reserved instance keys — single source of truth for underscore-prefixed
 * keys in stored container/instance shapes, consumed by codegen and the
 * runtime public-read strip so the two can't drift on which keys to omit.
 */

/** The reserved instance key names. */
export const RESERVED_KEY = {
    /** Stable per-item UUID (identity for diffs/versioning). */
    id: '_id',
    /** Block discriminator (`blocks` items only). */
    type: '_type',
    /** Editorial soft-disable flag. */
    disabled: '_disabled',
    /** Editorial display label. */
    title: '_title',
    /** Recursive child array (`tree` items only); structural, emitted by codegen. */
    children: '_children',
} as const;

export type ReservedKey = (typeof RESERVED_KEY)[keyof typeof RESERVED_KEY];

/**
 * TS emission + public visibility for each metadata reserved key. `_children` is
 * excluded: it is a structural recursive array emitted directly by codegen, not a
 * flat metadata key. `inPublic: false` keys are editorial and stripped from
 * public reads.
 */
export const RESERVED_KEY_META: Record<string, { tsLine: string; inPublic: boolean }> = {
    [RESERVED_KEY.id]: { tsLine: '_id: string;', inPublic: true },
    [RESERVED_KEY.type]: { tsLine: '_type: string;', inPublic: true },
    [RESERVED_KEY.disabled]: { tsLine: '_disabled?: boolean;', inPublic: false },
    [RESERVED_KEY.title]: { tsLine: '_title?: string;', inPublic: false },
};

/**
 * Reserved keys deleted from objects on a public read (editorial metadata).
 * Derived from `RESERVED_KEY_META` so it can't drift from codegen.
 */
export const PUBLIC_STRIPPED_KEYS: ReadonlySet<string> = new Set(
    Object.entries(RESERVED_KEY_META)
        .filter(([, meta]) => !meta.inPublic)
        .map(([key]) => key)
);
