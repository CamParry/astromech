/** The error only globals throw: a staged change that already exists. */

import { ApiError } from '@/errors/api-error';

/**
 * Thrown by `createStaged` when that locale of the global already has a staged
 * change. The key and locale are the whole address of the existing staged row,
 * so the admin needs no second id to redirect to it.
 */
export class StagedGlobalExistsError extends ApiError {
    public readonly key: string;
    public readonly locale: string;

    constructor(args: { key: string; locale: string }) {
        super(
            `Global '${args.key}' already has a staged change for locale ` +
                `'${args.locale}'`,
            {
                status: 409,
                code: 'staged_global_exists',
                details: { locale: args.locale },
            }
        );
        this.name = 'StagedGlobalExistsError';
        this.key = args.key;
        this.locale = args.locale;
    }
}
