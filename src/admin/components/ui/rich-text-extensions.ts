/**
 * Re-exports the shared rich-text extension factory + allow type for use
 * within the admin SPA. Core/server code imports directly from
 * `@/fields/rich-text/extensions.js`.
 */

export { buildRichTextExtensions } from '@/fields/rich-text/extensions.js';
export type { RichTextAllow } from '@/types/fields.js';
