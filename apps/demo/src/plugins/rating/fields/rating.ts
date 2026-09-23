/**
 * The `rating` field type: a whole number of stars from 0 to 5. Registered
 * beside the core types, so the server coerces, defaults and validates it;
 * `component` names the admin renderer, which reuses `ratingError`.
 */

import type { PluginFieldType } from 'astromech';

/** The custom field type this plugin registers. */
export const RATING_FIELD_TYPE = 'rating';

/** The highest rating a value may hold. */
export const MAX_RATING = 5;

export const ratingField: PluginFieldType = {
    type: RATING_FIELD_TYPE,
    component: './admin/fields/rating-field.tsx',
    defaultValue: 0,
    tsType: () => 'number',
    coerce: (value) =>
        typeof value === 'string' && value.trim() !== '' ? Number(value) : value,
    validate: async ({ value }) => ratingError(value) ?? true,
};

/** Why `value` is not a rating, or `undefined` when it is one. */
export function ratingError(value: unknown): string | undefined {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
        return 'Rating must be a whole number';
    }
    if (value < 0 || value > MAX_RATING)
        return `Rating must be between 0 and ${MAX_RATING}`;
    return undefined;
}
