import { ApiError } from '@/errors/api-error';

/**
 * The refusal a scoped service handle throws. Distinct from a validation
 * failure: nothing was wrong with the call — the caller's role simply was not
 * handed the method.
 */
export class PermissionDeniedError extends ApiError {
    /** Dotted method id, e.g. `users.create` or `entries.publish`. */
    readonly method: string;
    /**
     * The permission the method needed, or null when no permission could be
     * resolved for the call at all — a method that cannot say what it requires
     * cannot be granted, so the scoped handle refuses it.
     */
    readonly permission: string | null;

    /**
     * @param wording `detail` is a complete phrase (ending in a period)
     *   replacing the default reason, for a refusal the `method`/`permission`
     *   pair does not explain on its own, e.g. a call that named no entry type.
     *   `message` replaces the whole message, for an access rule that words its
     *   own refusal.
     */
    constructor(
        method: string,
        permission: string | null,
        wording?: { detail: string } | { message: string }
    ) {
        const reason =
            permission === null
                ? 'carries no method descriptor, so a scoped handle cannot grant it.'
                : `requires "${permission}".`;
        const message =
            wording !== undefined && 'message' in wording
                ? wording.message
                : `Permission denied: "${method}" ${wording?.detail ?? reason}`;
        super(message, {
            status: 403,
            code: 'FORBIDDEN',
        });
        this.name = 'PermissionDeniedError';
        this.method = method;
        this.permission = permission;
    }
}
