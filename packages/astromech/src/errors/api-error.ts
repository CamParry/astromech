/**
 * `ApiError` — the base of every error a caller causes rather than the server:
 * it carries the HTTP status and the wire code it answers with, so the HTTP
 * layer maps each one in a single place whichever transport threw it.
 */

/** The `code` an error response carries. */
export type ApiErrorCode =
    | 'NOT_FOUND'
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'VALIDATION_FAILED'
    | 'CONFLICT'
    | 'INTERNAL_ERROR'
    | 'BAD_REQUEST'
    | 'METHOD_NOT_ALLOWED'
    | 'SIGN_UP_CLOSED'
    | 'capability_not_supported'
    | 'staged_entry_exists'
    | 'staged_global_exists';

/** An error with the status and code the HTTP layer answers it with. */
export class ApiError extends Error {
    public readonly status: number;
    public readonly code: ApiErrorCode;
    /** Extra members of the response's `details`, when the code needs any. */
    public readonly details: Record<string, unknown> | undefined;

    constructor(
        message: string,
        response: {
            status: number;
            code: ApiErrorCode;
            details?: Record<string, unknown>;
        }
    ) {
        super(message);
        this.name = 'ApiError';
        this.status = response.status;
        this.code = response.code;
        this.details = response.details;
    }
}
