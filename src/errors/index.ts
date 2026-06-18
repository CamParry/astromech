// Generic, cross-cutting errors only. Entry-specific errors
// (EntryTypeMismatchError, BulkOperationError, CapabilityError) live in their
// owning domain — import them from @/entries/errors.js.
export { ValidationError } from './validation.js';
