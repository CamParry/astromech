/**
 * The presentational `seo-preview` field type. It renders a SERP preview from
 * its sibling title and description and stores nothing, so parsing, codegen
 * and public reads skip it; only the admin renders it.
 */

import type { PluginFieldType } from 'astromech';

export const seoPreviewField: PluginFieldType = {
    type: 'seo-preview',
    component: './admin/fields/seo-preview-field.tsx',
    affectsData: false,
};
