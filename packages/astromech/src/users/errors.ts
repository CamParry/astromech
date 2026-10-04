/** The error only users throw: the refusal to lose the last admin. */

import { ApiError } from '@/errors/api-error';

/**
 * Thrown by a write that would leave the site with no user holding the `admin`
 * role: demoting or deleting the last one. A 409, as the refusal depends on the
 * other users' roles rather than on the request; `details.reason` is
 * `last-admin`.
 */
export class LastAdminError extends ApiError {
    constructor(message: string) {
        super(message, {
            status: 409,
            code: 'CONFLICT',
            details: { reason: 'last-admin' },
        });
        this.name = 'LastAdminError';
    }
}
