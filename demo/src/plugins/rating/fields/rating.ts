/**
 * The `rating` custom field type registration. The component is an import
 * specifier (browser code, loaded by the code-gen virtual module); everything
 * else here is manifest data. The renderer also exports `validate`.
 */

import type { PluginFieldTypeRegistration } from 'astromech';
import { asset } from '../manifest.js';
import { RATING_FIELD_TYPE } from '../types.js';

export const ratingField: PluginFieldTypeRegistration = {
    type: RATING_FIELD_TYPE,
    component: asset('fields/rating-field.tsx'),
    defaultValue: 0,
    typeGen: () => 'number',
};
