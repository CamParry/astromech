import type { Capability } from '@/entries/capabilities';
import { ApiError } from '@/errors/api-error';

/**
 * Thrown when a write addresses an entry type that no root or plugin declaration
 * resolves to. Without it the row is written as a ghost stamped with a type
 * nothing can render or query. Reads already return empty, so only writes guard.
 */
export class UnknownEntryTypeError extends ApiError {
    public readonly entryType: string;

    constructor(type: string) {
        super(
            `Entry type '${type}' is not registered. Plugin entry types are addressed ` +
                `by their qualified id, e.g. \`\${ctx.plugin.namespace}/redirect\`.`,
            { status: 404, code: 'NOT_FOUND' }
        );
        this.name = 'UnknownEntryTypeError';
        this.entryType = type;
    }
}

/**
 * Thrown when a bulk entry operation fails on a specific id. The transaction
 * rolls the whole batch back; `succeededBefore` reports the ids completed before
 * the failure, which is informational only — those writes are rolled back too.
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
 * Thrown by an operation addressing an entry, or one locale of it, that has no
 * row. The HTTP layer maps it to a 404; `get` answers null rather than throwing.
 */
export class EntryNotFoundError extends ApiError {
    public readonly entryId: string;
    public readonly locale: string | undefined;

    constructor(args: { entryId: string; locale?: string | undefined }) {
        super(
            args.locale === undefined
                ? `Entry '${args.entryId}' not found`
                : `Entry '${args.entryId}' not found in locale '${args.locale}'`,
            { status: 404, code: 'NOT_FOUND' }
        );
        this.name = 'EntryNotFoundError';
        this.entryId = args.entryId;
        this.locale = args.locale;
    }
}

/**
 * Thrown by `createStaged` when that locale of the entry already has a staged
 * change. Carries the locale, which with the entry id is the whole address of
 * the existing staged row — the admin needs no second id to redirect to it.
 */
export class StagedEntryExistsError extends ApiError {
    public readonly canonicalId: string;
    public readonly locale: string;

    constructor(args: { canonicalId: string; locale: string }) {
        super(
            `Entry '${args.canonicalId}' already has a staged change for locale ` +
                `'${args.locale}'`,
            { status: 409, code: 'staged_entry_exists', details: { locale: args.locale } }
        );
        this.name = 'StagedEntryExistsError';
        this.canonicalId = args.canonicalId;
        this.locale = args.locale;
    }
}

/**
 * Thrown when a read asks for trashed entries in the public shape. The two are
 * mutually exclusive: public visibility drops every trashed row after the
 * repository call, so the combination answers an empty list either way.
 */
export class PublicTrashedReadError extends ApiError {
    constructor() {
        super(
            'entries.query: trashed reads require the full shape — a ' +
                'public read never returns trashed entries. Pass full: true (and ' +
                'authenticate).',
            { status: 400, code: 'BAD_REQUEST' }
        );
        this.name = 'PublicTrashedReadError';
    }
}

/**
 * Thrown when `where: { references }` is malformed or names a schema path no
 * queried type declares a relationship field at. A typo'd path would otherwise
 * compile to a predicate matching nothing and answer an empty page.
 */
export class InvalidReferencesFilterError extends ApiError {
    public readonly entryTypes: string[];
    public readonly knownPaths: string[];

    constructor(args: { detail: string; entryTypes: string[]; knownPaths: string[] }) {
        const known =
            args.knownPaths.length > 0 ? args.knownPaths.join(', ') : '(none declared)';
        super(
            `entries.query: ${args.detail} ` +
                `Queried types: ${args.entryTypes.join(', ')}. ` +
                `Known relationship paths: ${known}.`,
            { status: 400, code: 'BAD_REQUEST' }
        );
        this.name = 'InvalidReferencesFilterError';
        this.entryTypes = args.entryTypes;
        this.knownPaths = args.knownPaths;
    }
}

/**
 * Thrown when `entries.query` names several types and at least one of them is
 * stored in its own table. The whole query goes to one repository, and a custom
 * table holds its own type alone, so the rows of one side would go missing
 * without an error.
 */
export class CustomTableCrossTypeQueryError extends ApiError {
    public readonly entryTypes: string[];
    public readonly customTableTypes: string[];

    constructor(entryTypes: string[], customTableTypes: string[]) {
        super(
            `entries.query: a type stored in its own table cannot be queried ` +
                `together with other types. Query ${customTableTypes.join(', ')} on ` +
                `its own. Queried types: ${entryTypes.join(', ')}.`,
            { status: 400, code: 'BAD_REQUEST' }
        );
        this.name = 'CustomTableCrossTypeQueryError';
        this.entryTypes = entryTypes;
        this.customTableTypes = customTableTypes;
    }
}

/**
 * Thrown when `entries.query`'s `where` carries a key `buildListWhere` doesn't
 * recognize. Discarding one instead would answer every row rather than an error.
 */
export class UnknownWhereKeyError extends ApiError {
    public readonly key: string;

    constructor(key: string) {
        super(
            `entries.query: unrecognized where key '${key}'. Column ` +
                `filters are 'status', 'slug', 'title' and 'id'; relationships use ` +
                `where: { references: { path, id } }.`,
            { status: 400, code: 'BAD_REQUEST' }
        );
        this.name = 'UnknownWhereKeyError';
        this.key = key;
    }
}

/**
 * Thrown when `entries.query`'s `sort` names a field the entries-table repository
 * cannot order by. Discarding one instead would silently answer in the default
 * `createdAt desc` order.
 */
export class UnknownSortKeyError extends ApiError {
    public readonly key: string;
    public readonly sortableFields: readonly string[];

    constructor(key: string, sortableFields: readonly string[]) {
        super(
            `entries.query: unrecognized sort key '${key}'. Sortable ` +
                `fields are ${sortableFields.map((f) => `'${f}'`).join(', ')}.`,
            { status: 400, code: 'BAD_REQUEST' }
        );
        this.name = 'UnknownSortKeyError';
        this.key = key;
        this.sortableFields = sortableFields;
    }
}

/**
 * Thrown when an operation is attempted on a resource that does not declare the
 * required capability. Shared with globals, which pass `kind: 'Global'` so the
 * message names what was addressed; `entryType` keeps its name and holds the
 * resource's id either way.
 */
export class CapabilityError extends ApiError {
    public readonly capability: Capability;
    public readonly entryType: string;

    constructor(entryType: string, capability: Capability, kind = 'Entry type') {
        super(`${kind} "${entryType}" does not support capability: ${capability}`, {
            status: 409,
            code: 'capability_not_supported',
        });
        this.name = 'CapabilityError';
        this.capability = capability;
        this.entryType = entryType;
    }
}
