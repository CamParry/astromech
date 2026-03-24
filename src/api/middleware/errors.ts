/**
 * API Error Middleware
 *
 * Provides canonical error response format and handlers for Hono.
 */

import type { Context, ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError } from 'zod';

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

export function badRequest(c: Context, message: string, details?: ApiErrorDetails): Response {
    return apiError(c, 400, 'BAD_REQUEST', message, details);
}

export function validationFailed(c: Context, fields: Record<string, string[]>): Response {
    return apiError(c, 422, 'VALIDATION_FAILED', 'Validation failed', { fields });
}

export function conflict(c: Context, message: string): Response {
    return apiError(c, 409, 'CONFLICT', message);
}

export function internalError(c: Context, message = 'An unexpected error occurred'): Response {
    return apiError(c, 500, 'INTERNAL_ERROR', message);
}

// ============================================================================
// App-Level Handlers
// ============================================================================

/** Convert a ZodError into a validationFailed response. */
export function fromZodError(c: Context, err: ZodError): Response {
    const fields: Record<string, string[]> = {};
    for (const issue of err.issues) {
        const key = issue.path.join('.') || '_';
        (fields[key] ??= []).push(issue.message);
    }
    return validationFailed(c, fields);
}

export const onError: ErrorHandler = (err, c) => {
    if (err instanceof HTTPException) {
        return apiError(c, err.status, 'INTERNAL_ERROR', err.message);
    }

    const isDev = process.env.NODE_ENV !== 'production';
    const message = isDev && err instanceof Error ? err.message : 'An unexpected error occurred';

    console.error('[Astromech API]', err);
    return apiError(c, 500, 'INTERNAL_ERROR', message);
};

export const onNotFound: NotFoundHandler = (c) => {
    return notFound(c, `Route ${c.req.method} ${c.req.path} not found`);
};
