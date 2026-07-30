import type { Capability } from './storage/capabilities.js';

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
 * Thrown when a write addresses an entry type that no root or plugin
 * declaration resolves to.
 *
 * Without this an unregistered type is silently accepted: there are no field
 * definitions to validate against, so the row is written as a ghost stamped
 * with a type nothing can render or query. Reads already return empty for an
 * unresolvable type, so only writes need the guard.
 */
export class UnknownEntryTypeError extends Error {
    public readonly entryType: string;

    constructor(type: string) {
        super(
            `Entry type '${type}' is not registered. Plugin entry types are addressed ` +
                `by their qualified id, e.g. \`\${ctx.plugin.namespace}/redirect\`.`
        );
        this.name = 'UnknownEntryTypeError';
        this.entryType = type;
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

/**
 * Thrown by `createStaged` when the canonical entry already has a staged change.
 * Carries the existing staged entry's id so the admin can redirect to it instead
 * of creating a second one (the service stays dumb; the UI owns the redirect).
 */
export class StagedEntryExistsError extends Error {
    public readonly canonicalId: string;
    public readonly stagedId: string;

    constructor(args: { canonicalId: string; stagedId: string }) {
        super(
            `Entry '${args.canonicalId}' already has a staged change ('${args.stagedId}')`
        );
        this.name = 'StagedEntryExistsError';
        this.canonicalId = args.canonicalId;
        this.stagedId = args.stagedId;
    }
}

/**
 * Thrown when a read asks for trashed entries in the public shape.
 *
 * The two are mutually exclusive: public visibility drops every trashed row
 * after the storage call, so the combination returned an empty list that was
 * indistinguishable from "nothing is trashed". Failing names the caller bug.
 */
export class PublicTrashedReadError extends Error {
    constructor() {
        super(
            '[astromech] entries.query: trashed reads require the full shape — a ' +
                'public read never returns trashed entries. Pass full: true (and ' +
                'authenticate).'
        );
        this.name = 'PublicTrashedReadError';
    }
}

/**
 * Thrown when a route or entries-service operation is attempted on an entry type
 * that does not support the required capability.
 */
export class CapabilityError extends Error {
    public readonly capability: Capability;
    public readonly entryType: string;

    constructor(entryType: string, capability: Capability) {
        super(`Entry type "${entryType}" does not support capability: ${capability}`);
        this.name = 'CapabilityError';
        this.capability = capability;
        this.entryType = entryType;
    }
}
