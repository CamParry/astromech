/**
 * The errors the media operations throw, mirroring `globals/errors.ts`: a
 * not-found the HTTP layer maps to 404, and a validation failure it maps to 422.
 */

import type { FieldErrors } from '@/types/fields';
import { ValidationError } from '@/errors/validation';

/**
 * Thrown for an id no media row holds, and for a locale of a media item that has
 * no content row where an operation requires one. `get` answers null for an
 * unknown id rather than throwing.
 */
export class MediaNotFoundError extends Error {
    public readonly id: string;
    public readonly locale: string | undefined;

    constructor(args: { id: string; locale?: string | undefined }) {
        super(
            args.locale === undefined
                ? `Media '${args.id}' not found`
                : `Media '${args.id}' not found in locale '${args.locale}'`
        );
        this.name = 'MediaNotFoundError';
        this.id = args.id;
        this.locale = args.locale;
    }
}

/**
 * A 422 from the media operations — the envelope around a write, not a field
 * value. Extends the core `ValidationError` so the HTTP layer's 422 handler maps
 * it identically without knowing media exists.
 */
export class MediaValidationError extends ValidationError {
    constructor(messages: string[], fields: FieldErrors = {}) {
        const { issues } = ValidationError.fromFieldErrors(fields, messages);
        super(issues, fields, messages);
        this.name = 'MediaValidationError';
    }
}
