/**
 * The resource types as values. A leaf that imports nothing, so the table
 * declarations and `content/schema.ts` can build enums from them at load time.
 * `RESOURCE_CONFIG` in `content/resources.ts` cannot hold them: it imports every
 * resource's schema, and those import `content/schema.ts`.
 */

/**
 * Every resource type: what carries fields and runs the field pipeline. The
 * relationships index's source column and `TARGET_KINDS`, the relation-eligible
 * subset, are built from it.
 */
export const RESOURCE_TYPES = ['entry', 'global', 'user', 'media'] as const;

/**
 * What a relation can point at: every resource but a global, which is addressed
 * by its key and never referenced. The index's `targetKind` column is built from it.
 */
export const TARGET_KINDS = [
    'entry',
    'user',
    'media',
] as const satisfies readonly (typeof RESOURCE_TYPES)[number][];
