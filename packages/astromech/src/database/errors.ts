/** The error a database driver throws when it refuses a restore and changes nothing. */

import { ApiError } from '@/errors/api-error';

/**
 * Thrown by `DatabaseDriver.restore` when the backup and the live database
 * cannot be reconciled: a migration one records and the other lacks, a table
 * whose columns differ, or a row left pointing at a row that is gone.
 */
export class RestoreRefusedError extends ApiError {
    constructor(message: string, details: Record<string, unknown>) {
        super(message, { status: 409, code: 'CONFLICT', details });
        this.name = 'RestoreRefusedError';
    }
}
