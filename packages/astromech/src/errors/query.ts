/** The refusal a list answers for a sort it cannot apply. */

import { ApiError } from '@/errors/api-error';

/**
 * Thrown when a list's `sort` names a column it cannot order by. Discarding it
 * instead would silently answer in the default order.
 */
export class UnknownSortKeyError extends ApiError {
    public readonly key: string;
    public readonly sortableFields: readonly string[];

    constructor(key: string, sortableFields: readonly string[]) {
        super(
            `Unrecognized sort key '${key}'. Sortable fields are ` +
                `${sortableFields.map((field) => `'${field}'`).join(', ')}.`,
            { status: 400, code: 'BAD_REQUEST' }
        );
        this.name = 'UnknownSortKeyError';
        this.key = key;
        this.sortableFields = sortableFields;
    }
}
