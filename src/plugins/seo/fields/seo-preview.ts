/**
 * The presentational `seo-preview` custom field type. Renders a SERP preview
 * from its sibling title/description; persists no data, so `typeGen` returns
 * `null` to omit it from generated entry `Fields` types.
 */

import type { PluginFieldTypeRegistration } from '@/types/index.js';
import { asset } from '../manifest.js';

export const seoPreviewField: PluginFieldTypeRegistration = {
    type: 'seo-preview',
    component: asset('admin/fields/seo-preview-field.tsx'),
    defaultValue: null,
    typeGen: () => null,
};
