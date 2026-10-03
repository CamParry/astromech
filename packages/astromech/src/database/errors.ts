/** The errors a database driver throws when it refuses a restore and changes nothing. */

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

/**
 * Thrown by `DatabaseDriver.restore` for a backup that is not a site's
 * database: not SQLite, failing its integrity check, or recording no
 * migrations. The fault is in the backup the caller chose, so it answers 422
 * with the message as a whole-input error, the shape every 422 carries.
 */
export class InvalidBackupError extends ApiError {
    constructor(message: string) {
        super(message, {
            status: 422,
            code: 'VALIDATION_FAILED',
            details: { fields: { _: [message] } },
        });
        this.name = 'InvalidBackupError';
    }
}
