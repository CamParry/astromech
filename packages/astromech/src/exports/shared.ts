/**
 * `astromech/shared`: the browser-safe values the admin reads from core.
 * Everything here must bundle for the browser; `tests/exports/shared-browser.test.ts` checks it.
 */

export { countStatus } from '@/fields/count';
export { formatInstancePath, parseInstancePath } from '@/fields/field-path';
export { getFieldType } from '@/fields/field-type-registry';
export { flattenEntryFields, flattenFieldNodes } from '@/fields/flatten';
export { safeParseFields } from '@/fields/parse-fields';
export { buildRichTextExtensions } from '@/fields/rich-text/extensions';
export { parseEntryTypeId, qualifyEntryType } from '@/entries/entry-types.shared';
export { resolveEntryUrl } from '@/entries/entry-url.shared';
export { entryValidationMode } from '@/entries/validation-mode.shared';
export { buildVariantUrl } from '@/media/serving/image/url.shared';
export { formatAiContextMessage } from '@/utilities/ai-context';
export { resolveContentLocale } from '@/utilities/locale';
export { hasPermission } from '@/utilities/permission-match';
