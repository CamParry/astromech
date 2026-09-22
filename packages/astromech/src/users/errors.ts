/**
 * The errors the users operations throw, mirroring `media/errors.ts`: a
 * not-found the HTTP layer maps to 404, a validation failure it maps to 422, and
 * the last-admin refusal it maps to 400.
 */

import type { FieldErrors } from '@/types/fields';
import { ApiError } from '@/errors/api-error';
import { ValidationError } from '@/errors/validation';

/**
 * Thrown for an id no user row holds, and for a locale of a user that has no
 * content row where an operation requires one. `get` answers null for an
 * unknown id rather than throwing.
 */
export class UserNotFoundError extends ApiError {
    public readonly id: string;
    public readonly locale: string | undefined;

    constructor(args: { id: string; locale?: string | undefined }) {
        super(
            args.locale === undefined
                ? `User '${args.id}' not found`
                : `User '${args.id}' not found in locale '${args.locale}'`,
            { status: 404, code: 'NOT_FOUND' }
        );
        this.name = 'UserNotFoundError';
        this.id = args.id;
        this.locale = args.locale;
    }
}

/**
 * A 422 from the users operations — the envelope around a write, not a field
 * value. Extends the core `ValidationError` so the HTTP layer's 422 handler maps
 * it identically without knowing users exists.
 */
export class UserValidationError extends ValidationError {
    constructor(messages: string[], fields: FieldErrors = {}) {
        const { issues } = ValidationError.fromFieldErrors(fields, messages);
        super(issues, fields, messages);
        this.name = 'UserValidationError';
    }
}

/**
 * Thrown by a write that would leave the site with no user holding the `admin`
 * role: demoting or deleting the last one.
 */
export class LastAdminError extends ApiError {
    constructor(message: string) {
        super(message, { status: 400, code: 'BAD_REQUEST' });
        this.name = 'LastAdminError';
    }
}
