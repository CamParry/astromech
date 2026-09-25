/**
 * The capability vocabulary an entry type turns on or off, and a method's
 * `requires` names.
 */

export type Capability =
    | 'statuses'
    | 'slug'
    | 'translatable'
    | 'versioning'
    | 'trash'
    | 'staging';

/** Every capability. */
const ALL_CAPABILITIES: readonly Capability[] = [
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
