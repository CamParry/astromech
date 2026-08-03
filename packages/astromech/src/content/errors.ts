/** Errors raised by the content operations before anything is written. */

/** Thrown when an operation cannot run at all — bad target, nothing eligible. */
export class ContentOperationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ContentOperationError';
    }
}

/**
 * Thrown when a provider breaks the contract it declares: one output per input,
 * in order. The whole operation fails rather than guessing an alignment.
 */
export class ContentProviderContractError extends Error {
    public readonly path: string;
    public readonly expected: number;
    public readonly received: number;

    constructor(args: { path: string; expected: number; received: number }) {
        super(
            `Content provider returned ${String(args.received)} output(s) for ` +
                `${String(args.expected)} input(s) on field '${args.path}'`
        );
        this.name = 'ContentProviderContractError';
        this.path = args.path;
        this.expected = args.expected;
        this.received = args.received;
    }
}
