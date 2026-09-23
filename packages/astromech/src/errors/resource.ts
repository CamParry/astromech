/**
 * The not-found and validation errors every resource throws: one class each,
 * carrying which kind of resource the call addressed, so a transport maps them
 * without knowing entries, globals, media or users exist.
 */

import type { ResourceType } from '@/types/domain';
import type { FieldErrors } from '@/types/fields';
import { ApiError } from '@/errors/api-error';
import { ValidationError } from '@/errors/validation';

/** How a message names each kind. */
const LABELS: Record<ResourceType, string> = {
    entry: 'Entry',
    global: 'Global',
    user: 'User',
    media: 'Media',
};

/**
 * Thrown for an id (a global's key) no row or declaration holds, for a locale of
 * one with no content row where an operation requires one, and, with `staged`,
 * for a locale with no staged change. A `get` answers null rather than throwing.
 */
export class ResourceNotFoundError extends ApiError {
    public readonly kind: ResourceType;
    /** The resource id, or a global's key. */
    public readonly id: string;
    public readonly locale: string | undefined;

    constructor(
        kind: ResourceType,
        args: { id: string; locale?: string | undefined; staged?: boolean }
    ) {
        super(notFoundMessage(`${LABELS[kind]} '${args.id}'`, args), {
            status: 404,
            code: 'NOT_FOUND',
        });
        this.name = 'ResourceNotFoundError';
        this.kind = kind;
        this.id = args.id;
        this.locale = args.locale;
    }
}

/**
 * A 422 about the envelope around a write rather than a field value, such as a
 * locale a non-translatable resource cannot hold. A `ValidationError`, so the
 * HTTP layer answers it as any other.
 */
export class ResourceValidationError extends ValidationError {
    constructor(messages: string[], fields: FieldErrors = {}) {
        const { issues } = ValidationError.fromFieldErrors(fields, messages);
        super(issues, fields, messages);
        this.name = 'ResourceValidationError';
    }
}

/**
 * Thrown by `createStaged` when that locale already has a staged change. The id
 * and locale are the whole address of the existing staged row, so the admin
 * needs no second id to open it.
 */
export class StagedChangeExistsError extends ApiError {
    public readonly kind: ResourceType;
    /** The resource id, or a global's key. */
    public readonly id: string;
    public readonly locale: string;

    constructor(kind: ResourceType, args: { id: string; locale: string }) {
        super(
            `${LABELS[kind]} '${args.id}' already has a staged change for locale ` +
                `'${args.locale}'`,
            {
                status: 409,
                code: 'staged_change_exists',
                details: { locale: args.locale },
            }
        );
        this.name = 'StagedChangeExistsError';
        this.kind = kind;
        this.id = args.id;
        this.locale = args.locale;
    }
}

function notFoundMessage(
    subject: string,
    args: { locale?: string | undefined; staged?: boolean }
): string {
    if (args.staged === true) {
        return `${subject} has no staged change in locale '${args.locale ?? ''}'`;
    }
    return args.locale === undefined
        ? `${subject} not found`
        : `${subject} not found in locale '${args.locale}'`;
}
