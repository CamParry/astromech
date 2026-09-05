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

/** Whether a string names a capability — a method's `requires` is typed `string`. */
export function isCapability(value: string): value is Capability {
    return (ALL_CAPABILITIES as readonly string[]).includes(value);
}
