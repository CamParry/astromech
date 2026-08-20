/**
 * Generic, cross-cutting errors only. Entry-specific errors live in their
 * owning domain — import from `@/entries/errors.js`.
 */
export { ValidationError } from './validation';
export { PermissionDeniedError } from './permission';
export { AstromechError } from './astromech-error';
