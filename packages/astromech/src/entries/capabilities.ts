/**
 * The capability vocabulary an entry type's storage declares support for.
 */

export type Capability =
    | 'statuses'
    | 'slug'
    | 'translatable'
    | 'versioning'
    | 'trash'
    | 'staging';

/** All capabilities supported by built-in storage. */
export const BUILT_IN_SUPPORTS: readonly Capability[] = [
    'statuses',
    'slug',
    'translatable',
    'versioning',
    'trash',
    'staging',
];
