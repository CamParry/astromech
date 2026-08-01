/**
 * The refusal a scoped service handle throws. Distinct from a validation
 * failure: nothing was wrong with the call — the principal simply was not handed
 * the method.
 */
export class PermissionDeniedError extends Error {
    /** Dotted method id, e.g. `users.create` or `entries.publish`. */
    readonly method: string;
    /**
     * The permission the method needed, or null when no permission could be
     * resolved for the call at all — a method that cannot say what it requires
     * cannot be granted, so the scoped handle refuses it.
     */
    readonly permission: string | null;

    /**
     * @param detail A complete phrase (ending in a period) replacing the default
     *   reason, for a refusal the `method`/`permission` pair does not explain on
     *   its own — e.g. a call that named no entry type.
     */
    constructor(method: string, permission: string | null, detail?: string) {
        const reason =
            permission === null
                ? 'carries no method descriptor, so a scoped handle cannot grant it.'
                : `requires "${permission}".`;
        super(`Permission denied: "${method}" ${detail ?? reason}`);
        this.name = 'PermissionDeniedError';
        this.method = method;
        this.permission = permission;
    }
}
