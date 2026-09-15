/**
 * Re-exports the shared rich-text extension factory + allow type for use
 * within the admin SPA. Core/server code imports directly from
 * `@/fields/rich-text/extensions.js`.
 */

export { buildRichTextExtensions } from 'astromech/shared';
export type { RichTextAllow } from 'astromech';
