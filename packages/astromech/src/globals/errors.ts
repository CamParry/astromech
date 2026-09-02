/**
 * The errors the globals operations throw. `CapabilityError` is entries', reused
 * with `kind: 'Global'`, so a route mapping capability refusals maps one class.
 */

import type { FieldErrors } from '@/types/fields';
import { ValidationError } from '@/errors/validation';

/**
 * Thrown for a key no declaration resolves to, and for a declared global with no
 * row where an operation requires one. The HTTP layer maps it to a 404; `get`
 * answers null for a declared-but-unsaved global rather than throwing.
 */
export class GlobalNotFoundError extends Error {
    public readonly key: string;
    public readonly locale: string | undefined;

    constructor(args: { key: string; locale?: string | undefined }) {
        super(
            args.locale === undefined
                ? `Global '${args.key}' is not declared`
                : `Global '${args.key}' not found in locale '${args.locale}'`
        );
        this.name = 'GlobalNotFoundError';
        this.key = args.key;
        this.locale = args.locale;
    }
}

/**
 * A 422 from the globals operations — the envelope around a write, not a field
 * value. Extends the core `ValidationError` so the HTTP layer's 422 handler maps
 * it identically without knowing globals exist.
 */
export class GlobalValidationError extends ValidationError {
    constructor(messages: string[], fields: FieldErrors = {}) {
        const { issues } = ValidationError.fromFieldErrors(fields, messages);
        super(issues, fields, messages);
        this.name = 'GlobalValidationError';
    }
}

/**
 * Thrown by `createStaged` when that locale of the global already has a staged
 * change. The key and locale are the whole address of the existing staged row,
 * so the admin needs no second id to redirect to it.
 */
export class StagedGlobalExistsError extends Error {
    public readonly key: string;
    public readonly locale: string;

    constructor(args: { key: string; locale: string }) {
        super(
            `Global '${args.key}' already has a staged change for locale ` +
                `'${args.locale}'`
        );
        this.name = 'StagedGlobalExistsError';
        this.key = args.key;
        this.locale = args.locale;
    }
}
