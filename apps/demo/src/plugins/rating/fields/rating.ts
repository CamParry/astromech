/**
 * The `rating` custom field type registration. The component is an import
 * specifier (browser code, loaded by the code-gen virtual module); everything
 * else here is manifest data. The renderer also exports `validate`.
 */

import type { PluginFieldTypeRegistration } from 'astromech';

/** The custom field type this plugin registers. */
export const RATING_FIELD_TYPE = 'rating';

export const ratingField: PluginFieldTypeRegistration = {
    type: RATING_FIELD_TYPE,
    component: './admin/fields/rating-field.tsx',
    defaultValue: 0,
    typeGen: () => 'number',
};
