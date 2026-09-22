/**
 * `astromech/shared`: the browser-safe values the admin reads from core.
 * Everything here must bundle for the browser; `tests/exports/shared-browser.test.ts` checks it.
 */

export type { DataField, LayoutField } from '@/types/fields';
export { countStatus } from '@/fields/count';
export { formatInstancePath, parseInstancePath } from '@/fields/field-path';
export { getFieldType } from '@/fields/field-type-registry';
export { flattenEntryFields, flattenFieldNodes, isLayoutField } from '@/fields/flatten';
export { safeParseFields } from '@/fields/parse-fields';
export { buildRichTextExtensions } from '@/fields/rich-text/extensions';
export { parseEntryTypeId, qualifyEntryType } from '@/entries/entry-types';
export { resolveEntryUrl } from '@/entries/entry-url';
export { entryValidationMode } from '@/entries/validation-mode';
export { buildVariantUrl } from '@/media/serving/image/url';
export { formatAiContextMessage } from '@/utilities/ai-context';
export { resolveContentLocale } from '@/utilities/locale';
export { hasPermission } from '@/utilities/permission-match';
