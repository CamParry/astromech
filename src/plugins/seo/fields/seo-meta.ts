/**
 * The `seo-meta` custom field type registration. The component is a string
 * import specifier (browser code, loaded by the code-gen virtual module);
 * everything else here is manifest data.
 */

import type { PluginFieldTypeRegistration } from '@/types/index.js';

export const seoMetaField: PluginFieldTypeRegistration = {
    type: 'seo-meta',
    component: '@/plugins/seo/admin/fields/seo-meta-field.tsx',
    defaultValue: null,
    typeGen: () => '{ title?: string; description?: string }',
};
