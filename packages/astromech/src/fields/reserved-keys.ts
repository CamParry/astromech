/**
 * Reserved instance keys — single source of truth.
 *
 * Underscore-prefixed keys used in stored container/instance shapes
 * (group / repeater / blocks / tree items). Consumed by:
 *   - codegen (`codegen/type-generator.ts`) — which TS line each key emits, and
 *     in which shape (full / public);
 *   - the runtime public-read strip (`entries/visibility.ts`) — which keys are
 *     editorial metadata that must be removed from public reads.
 *
 * Centralising the `inPublic` semantics keeps codegen and the runtime strip from
 * drifting (e.g. codegen omitting a key from the public type while the strip
 * forgets to delete it, or vice versa). The typed instance shapes themselves
 * (`use-blocks-field.ts`, `use-tree-field.ts`, generated `.d.ts`) keep using the
 * literal property names — those are typed accesses, not membership checks.
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
