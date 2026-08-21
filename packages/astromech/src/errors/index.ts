/**
 * Generic, cross-cutting errors only, plus `parseInput`, which turns a zod
 * failure into one. Entry-specific errors live in their owning domain —
 * import from `@/entries/errors.js`.
 */
export { parseInput, ValidationError } from './validation';
export { PermissionDeniedError } from './permission';
export { AstromechError } from './astromech-error';
