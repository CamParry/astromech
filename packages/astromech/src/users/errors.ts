/** The error only users throw: the refusal to lose the last admin. */

import { ApiError } from '@/errors/api-error';

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
