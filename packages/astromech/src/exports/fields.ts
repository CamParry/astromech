/** `astromech/fields` — field & layout factories. */

export * from '@/fields/builder';
export type { ParsedFields } from '@/fields/parse-fields';
// Only the name predicate crosses over from the path grammar: a plugin that
// composes field definitions from stored JSON has to validate a name it did
// not author. Browser consumers deep-import `fields/field-path.js` instead.
export { isValidFieldName } from '@/fields/field-path';
export { parseFields, safeParseFields } from '@/fields/parse-fields';
export { mergePatch, projectToSchema } from '@/fields/values';
