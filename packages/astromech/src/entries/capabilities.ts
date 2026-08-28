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

/** Every capability. The entries-table repository supports all of them. */
export const ALL_CAPABILITIES: readonly Capability[] = [
    'statuses',
    'slug',
    'translatable',
    'versioning',
    'trash',
    'staging',
];
