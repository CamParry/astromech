/**
 * API Error Middleware
 *
 * Provides canonical error response format and handlers for Hono.
 */

import type { ApiErrorCode } from '@/errors/api-error';
import type { Context, ErrorHandler, NotFoundHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ZodIssue } from 'zod';
import { z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import { BulkOperationError } from '@/entries/errors';
import { resolveNodeEnv } from '@/env';
import { ApiError } from '@/errors/api-error';
import { PermissionDeniedError } from '@/errors/permission';
import { ValidationError } from '@/errors/validation';

export type ApiErrorDetails = {
    fields?: Record<string, string[]>;
    /** Form-level validation messages that belong to no single field. */
    form?: string[];
    [key: string]: unknown;
};

/** The `{ error }` body every error response answers with, as the OpenAPI document shows it. */
export const errorBodySchema = z
    .object({
        error: z.object({
            id: z.string(),
            code: z.string(),
            message: z.string(),
            status: z.number(),
            details: z.record(z.string(), z.unknown()).optional(),
        }),
    })
    .openapi('Error');

function generateErrorId(): string {
    return `err_${Math.random().toString(36).slice(2, 9)}`;
}

/** Build the canonical `{ error }` envelope every error response shares. */
function apiError(
    c: Context,
    status: number,
    code: ApiErrorCode,
    message: string,
    details?: ApiErrorDetails
): Response {
    const body: z.input<typeof errorBodySchema> = {
        error: {
            id: generateErrorId(),
            code,
            message,
            status,
            ...(details ? { details } : {}),
        },
    };
    return c.json(body, status as ContentfulStatusCode);
}

/** The response an `ApiError` answers with: its own status, code and details. */
export function errorResponse(c: Context, err: ApiError): Response {
    return apiError(c, err.status, err.code, err.message, err.details);
}

export function notFound(c: Context, message = 'Not found'): Response {
    return apiError(c, 404, 'NOT_FOUND', message);
}

export function unauthorized(c: Context, message = 'Authentication required'): Response {
    return apiError(c, 401, 'UNAUTHORIZED', message);
}

export function forbidden(
    c: Context,
    message = 'Insufficient permissions',
    code: ApiErrorCode = 'FORBIDDEN'
): Response {
    return apiError(c, 403, code, message);
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
function validationFailed(
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

/**
 * Convert a failed parse into a validationFailed response. Takes the issues
 * themselves, so a `ZodError` and a `ValidationError` both fit.
 *
 * The failure is reported under the names the CALLER sent, not the names of the
 * method's argument object: `bodyKey` names the key the request body was
 * validated under, and is stripped from the front of each field path.
 */
export function fromZodError(
    c: Context,
    err: { issues: readonly ZodIssue[] },
    bodyKey?: string
): Response {
    const fields: Record<string, string[]> = {};
    for (const issue of err.issues) {
        const path =
            bodyKey !== undefined && issue.path[0] === bodyKey
                ? issue.path.slice(1)
                : issue.path;
        const key = path.join('.') || '_';
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
 * Hono's app-level error handler: canonicalises HTTPException, every
 * `ApiError` under the status and code it carries, ValidationError (bare, or
 * wrapped by a batch write's BulkOperationError) and unknown errors alike.
 *
 * `ResourceValidationError` needs no case of its own: it extends
 * `ValidationError`, so it maps to the same 422.
 */
export const onError: ErrorHandler = (err, c) => {
    if (err instanceof HTTPException) {
        return apiError(c, err.status, codeForStatus(err.status), err.message);
    }

    // A refusal of a caller who never signed in is a missing session, not a
    // missing grant.
    if (err instanceof PermissionDeniedError && c.get('ctx')?.user == null) {
        return unauthorized(c);
    }

    if (err instanceof ApiError) return errorResponse(c, err);

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
    const isDev = resolveNodeEnv() === 'development';
    const message =
        isDev && err instanceof Error ? err.message : 'An unexpected error occurred';

    console.error('[Astromech API]', err);
    return apiError(c, 500, 'INTERNAL_ERROR', message);
};

/** The code an `HTTPException` answers with, read off its status. */
function codeForStatus(status: number): ApiErrorCode {
    switch (status) {
        case 400:
            return 'BAD_REQUEST';
        case 401:
            return 'UNAUTHORIZED';
        case 403:
            return 'FORBIDDEN';
        case 404:
            return 'NOT_FOUND';
        case 405:
            return 'METHOD_NOT_ALLOWED';
        case 409:
            return 'CONFLICT';
        case 422:
            return 'VALIDATION_FAILED';
        default:
            return status < 500 ? 'BAD_REQUEST' : 'INTERNAL_ERROR';
    }
}

export const onNotFound: NotFoundHandler = (c) => {
    return notFound(c, `Route ${c.req.method} ${c.req.path} not found`);
};
