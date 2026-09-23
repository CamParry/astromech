/**
 * The presentational `seo-preview` custom field type. Renders a SERP preview
 * from its sibling title/description; persists no data, so `tsType` returns
 * `null` to omit it from generated entry `Fields` types.
 */

import type { PluginFieldType } from 'astromech';

export const seoPreviewField: PluginFieldType = {
    type: 'seo-preview',
    component: './admin/fields/seo-preview-field.tsx',
    defaultValue: null,
    tsType: () => null,
};
