/**
 * Thrown when an entry mutation is called with a `type` that doesn't match the
 * stored `type` of the row identified by `id`.
 */
export class EntryTypeMismatchError extends Error {
    public readonly entryId: string;
    public readonly expectedType: string;
    public readonly actualType: string;

    constructor(args: { entryId: string; expectedType: string; actualType: string }) {
        super(
            `Entry '${args.entryId}' has type '${args.actualType}', not '${args.expectedType}'`
        );
        this.name = 'EntryTypeMismatchError';
        this.entryId = args.entryId;
        this.expectedType = args.expectedType;
        this.actualType = args.actualType;
    }
}

/**
 * Thrown when a bulk entry operation fails on a specific id. The DB transaction
 * rolls back the entire batch — `succeededBefore` reports which ids the
 * operation completed against *before* the failure (purely informational; those
 * writes have already been rolled back).
 */
export class BulkOperationError extends Error {
    public readonly failedId: string;
    public readonly reason: string;
    public readonly succeededBefore: string[];
    public readonly cause?: unknown;

    constructor(args: {
        failedId: string;
        reason: string;
        succeededBefore: string[];
        cause?: unknown;
    }) {
        super(
            `Bulk operation failed on id '${args.failedId}': ${args.reason} ` +
                `(succeeded before: ${args.succeededBefore.length})`
        );
        this.name = 'BulkOperationError';
        this.failedId = args.failedId;
        this.reason = args.reason;
        this.succeededBefore = args.succeededBefore;
        if (args.cause !== undefined) this.cause = args.cause;
    }
}
