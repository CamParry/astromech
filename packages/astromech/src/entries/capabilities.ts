/**
 * The capability vocabulary an entry type's repository declares support for.
 */

export type Capability =
    | 'statuses'
    | 'slug'
    | 'translatable'
    | 'versioning'
    | 'trash'
    | 'staging';

/** All capabilities supported by the built-in repository. */
export const BUILT_IN_SUPPORTS: readonly Capability[] = [
    'statuses',
    'slug',
    'translatable',
    'versioning',
    'trash',
    'staging',
];
