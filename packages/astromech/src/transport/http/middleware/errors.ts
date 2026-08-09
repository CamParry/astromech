/**
 * API Error Middleware
 *
 * Provides canonical error response format and handlers for Hono.
 */

import type { Context, ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ZodError } from 'zod';
import { ValidationError } from '@/errors/validation';

// ============================================================================
// Error Types
// ============================================================================

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

// ============================================================================
// Helpers
// ============================================================================

function generateErrorId(): string {
    return `err_${Math.random().toString(36).slice(2, 9)}`;
}

// ============================================================================
// Response Factory
// ============================================================================

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

// ============================================================================
// Convenience Factories
// ============================================================================

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
 * per-field failure keeps the response body it has always had.
 */
export function validationFailed(
    c: Context,
    fields: Record<string, string[]>,
    form?: string[]
): Response {
    return apiError(c, 422, 'VALIDATION_FAILED', 'Validation failed', {
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

// ============================================================================
// App-Level Handlers
// ============================================================================

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
 * `bodyKey` names the key the request body was validated under, and is stripped
 * from the front of each field path: a body parsed as one key of a larger
 * argument object still reports the field names the caller sent.
 */
export function fromZodError(c: Context, err: ZodError, bodyKey?: string): Response {
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

export const onError: ErrorHandler = (err, c) => {
    if (err instanceof HTTPException) {
        return apiError(c, err.status, 'INTERNAL_ERROR', err.message);
    }

    if (err instanceof ValidationError) {
        // Field-pipeline errors arrive pre-shaped; envelope (Zod) errors derive
        // their per-field map from the issues.
        if (err.fields) {
            return validationFailed(c, err.fields, err.form);
        }
        const fields: Record<string, string[]> = {};
        for (const issue of err.issues) {
            const key = issue.path.join('.') || '_';
            (fields[key] ??= []).push(issue.message);
        }
        return validationFailed(c, fields, err.form);
    }

    const isDev = process.env.NODE_ENV !== 'production';
    const message =
        isDev && err instanceof Error ? err.message : 'An unexpected error occurred';

    console.error('[Astromech API]', err);
    return apiError(c, 500, 'INTERNAL_ERROR', message);
};

export const onNotFound: NotFoundHandler = (c) => {
    return notFound(c, `Route ${c.req.method} ${c.req.path} not found`);
};
