/**
 * API Error Middleware
 *
 * Provides canonical error response format and handlers for Hono.
 */

import type { Context, ErrorHandler, NotFoundHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ZodError } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { BulkOperationError } from '@/entries/errors';
import { resolveEnv } from '@/env/index';
import { ValidationError } from '@/errors/validation';

export type ApiErrorCode =
    | 'NOT_FOUND'
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'VALIDATION_FAILED'
    | 'CONFLICT'
    | 'INTERNAL_ERROR'
    | 'BAD_REQUEST'
    | 'METHOD_NOT_ALLOWED';

export type ApiErrorDetails = {
    fields?: Record<string, string[]>;
    /** Form-level validation messages that belong to no single field. */
    form?: string[];
    [key: string]: unknown;
};

function generateErrorId(): string {
    return `err_${Math.random().toString(36).slice(2, 9)}`;
}

/** Build the canonical `{ error }` envelope every error response shares. */
export function apiError(
    c: Context,
    status: number,
    code: ApiErrorCode,
    message: string,
    details?: ApiErrorDetails
): Response {
    return c.json(
        {
            error: {
                id: generateErrorId(),
                code,
                message,
                status,
                ...(details ? { details } : {}),
            },
        },
        status as ContentfulStatusCode
    );
}

export function notFound(c: Context, message = 'Not found'): Response {
    return apiError(c, 404, 'NOT_FOUND', message);
}

export function unauthorized(c: Context, message = 'Authentication required'): Response {
    return apiError(c, 401, 'UNAUTHORIZED', message);
}

export function forbidden(c: Context, message = 'Insufficient permissions'): Response {
    return apiError(c, 403, 'FORBIDDEN', message);
}

export function badRequest(
    c: Context,
    message: string,
    details?: ApiErrorDetails
): Response {
    return apiError(c, 400, 'BAD_REQUEST', message, details);
}

/**
 * `form` is omitted from `details` unless it carries messages, so a plain
 * per-field failure keeps the response body it has always had. `extra` adds
 * further keys to `details` (a batch write's `failedId`).
 */
export function validationFailed(
    c: Context,
    fields: Record<string, string[]>,
    form?: string[],
    extra?: ApiErrorDetails
): Response {
    return apiError(c, 422, 'VALIDATION_FAILED', 'Validation failed', {
        ...extra,
        fields,
        ...(form && form.length > 0 ? { form } : {}),
    });
}

export function conflict(c: Context, message: string): Response {
    return apiError(c, 409, 'CONFLICT', message);
}

export function internalError(
    c: Context,
    message = 'An unexpected error occurred'
): Response {
    return apiError(c, 500, 'INTERNAL_ERROR', message);
}

/**
 * OpenAPIHono's own request-validation envelope, for a request that fails the
 * schema its documented operation declares. Distinct from the canonical error
 * body on purpose: it is what a client generated from the document expects.
 */
export function requestSchemaError(c: Context, err: ZodError): Response {
    return c.json({ success: false, error: err }, 400);
}

/**
 * Convert a ZodError into a validationFailed response.
 *
 * The failure is reported under the names the CALLER sent, not the names of the
 * method's argument object. `bodyKey` names the key the request body was
 * validated under and is stripped from the front of each field path;
 * `wireNames` renames an argument the wire spells differently (the bulk routes'
 * `id`, which is `ids` on the wire).
 */
export function fromZodError(
    c: Context,
    err: ZodError,
    bodyKey?: string,
    wireNames?: Record<string, string>
): Response {
    const fields: Record<string, string[]> = {};
    for (const issue of err.issues) {
        const path =
            bodyKey !== undefined && issue.path[0] === bodyKey
                ? issue.path.slice(1)
                : issue.path;
        const [head, ...tail] = path;
        const renamed =
            typeof head === 'string' && wireNames?.[head] !== undefined
                ? [wireNames[head], ...tail]
                : path;
        const key = renamed.join('.') || '_';
        (fields[key] ??= []).push(issue.message);
    }
    return validationFailed(c, fields);
}

/**
 * The per-field map a ValidationError reports: field-pipeline errors arrive
 * pre-shaped, envelope (Zod) errors derive theirs from the issues.
 */
function fieldErrorsFrom(err: ValidationError): Record<string, string[]> {
    if (err.fields) return err.fields;
    const fields: Record<string, string[]> = {};
    for (const issue of err.issues) {
        const key = issue.path.join('.') || '_';
        (fields[key] ??= []).push(issue.message);
    }
    return fields;
}

/**
 * Hono's app-level error handler: canonicalises HTTPException, ValidationError
 * — bare, or wrapped by a batch write's BulkOperationError — and unknown errors
 * alike.
 */
export const onError: ErrorHandler = (err, c) => {
    if (err instanceof HTTPException) {
        return apiError(c, err.status, 'INTERNAL_ERROR', err.message);
    }

    if (err instanceof ValidationError) {
        return validationFailed(c, fieldErrorsFrom(err), err.form);
    }

    // A batch write reports its validation failure through the envelope, whose
    // `failedId` is the only thing naming the row the client must point at.
    if (err instanceof BulkOperationError && err.cause instanceof ValidationError) {
        return validationFailed(c, fieldErrorsFrom(err.cause), err.cause.form, {
            failedId: err.failedId,
            succeededBefore: err.succeededBefore,
        });
    }

    // Anything but an explicit development environment is treated as
    // production: a Worker sets no NODE_ENV, and the wrong guess leaks
    // exception messages to clients.
    const isDev = resolveEnv('NODE_ENV') === 'development';
    const message =
        isDev && err instanceof Error ? err.message : 'An unexpected error occurred';

    console.error('[Astromech API]', err);
    return apiError(c, 500, 'INTERNAL_ERROR', message);
};

export const onNotFound: NotFoundHandler = (c) => {
    return notFound(c, `Route ${c.req.method} ${c.req.path} not found`);
};
