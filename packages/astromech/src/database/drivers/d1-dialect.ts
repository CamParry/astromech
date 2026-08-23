import type {
    CompiledQuery,
    DatabaseConnection,
    DatabaseIntrospector,
    Dialect,
    Driver,
    Kysely,
    QueryCompiler,
    QueryResult,
} from 'kysely';
import { SqliteAdapter, SqliteQueryCompiler } from 'kysely';
import { AstromechError } from '@/errors/index';
import { D1Introspector } from './d1-introspector';

/**
 * Hand-written Kysely dialect for Cloudflare D1. Not `kysely-d1`: that
 * package resolves its `D1Database` synchronously, but `d1({ binding })`
 * needs lazy, async resolution while keeping `getInstance()` synchronous.
 */

/** Structural subset of Cloudflare's D1Database we depend on. */
export type D1DatabaseLike = {
    prepare(query: string): D1PreparedStatementLike;
    batch<T = unknown>(statements: D1PreparedStatementLike[]): Promise<D1ResultLike<T>[]>;
};

export type D1PreparedStatementLike = {
    bind(...values: unknown[]): D1PreparedStatementLike;
    all<T = unknown>(): Promise<D1ResultLike<T>>;
};

export type D1ResultLike<T = unknown> = {
    results?: T[];
    success?: boolean;
    error?: string;
    meta?: { changes?: number; last_row_id?: number | null; [key: string]: unknown };
};

const NO_TRANSACTIONS_ERROR =
    'Cloudflare D1 has no interactive transactions (batch() is its only ' +
    'atomicity primitive). The d1() driver declares supportsTransactions: false so the ' +
    'entry repository degrades to sequential writes — reaching this error means something ' +
    'called db.transaction() directly.';

export type D1DialectConfig = {
    /** Resolves the D1 binding lazily — see `acquireConnection`. */
    database: () => Promise<D1DatabaseLike>;
};

export class D1Dialect implements Dialect {
    private readonly config: D1DialectConfig;

    constructor(config: D1DialectConfig) {
        this.config = config;
    }

    createDriver(): Driver {
        return new D1Driver(this.config);
    }

    createQueryCompiler(): QueryCompiler {
        return new SqliteQueryCompiler();
    }

    createAdapter(): SqliteAdapter {
        return new SqliteAdapter();
    }

    createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
        return new D1Introspector(db);
    }
}

class D1Driver implements Driver {
    private readonly config: D1DialectConfig;

    constructor(config: D1DialectConfig) {
        this.config = config;
    }

    async init(): Promise<void> {
        // Nothing to initialise — the binding resolves per-connection.
    }

    async acquireConnection(): Promise<DatabaseConnection> {
        // The binding resolves here, not in the dialect's constructor: this is
        // already async, which is why `DatabaseDriver.getInstance()` can stay
        // synchronous without widening the driver interface.
        return new D1Connection(await this.config.database());
    }

    async beginTransaction(): Promise<void> {
        throw new AstromechError(NO_TRANSACTIONS_ERROR);
    }

    async commitTransaction(): Promise<void> {
        throw new AstromechError(NO_TRANSACTIONS_ERROR);
    }

    async rollbackTransaction(): Promise<void> {
        throw new AstromechError(NO_TRANSACTIONS_ERROR);
    }

    async releaseConnection(): Promise<void> {
        // No pooling to release back to.
    }

    async destroy(): Promise<void> {
        // Nothing held open beyond the D1 binding itself.
    }
}

class D1Connection implements DatabaseConnection {
    private readonly db: D1DatabaseLike;

    constructor(db: D1DatabaseLike) {
        this.db = db;
    }

    async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
        const { sql, parameters } = compiledQuery;
        let statement = this.db.prepare(sql);
        if (parameters.length > 0) {
            statement = statement.bind(...parameters);
        }
        const result = await statement.all<R>();
        if (result.error !== undefined) {
            throw new AstromechError(`D1 query failed: ${result.error}`);
        }

        const meta = result.meta;
        const numAffectedRows =
            typeof meta?.changes === 'number' ? BigInt(meta.changes) : undefined;
        const insertId =
            typeof meta?.last_row_id === 'number' ? BigInt(meta.last_row_id) : undefined;

        return {
            rows: result.results ?? [],
            ...(numAffectedRows !== undefined
                ? { numAffectedRows, numUpdatedOrDeletedRows: numAffectedRows }
                : {}),
            ...(insertId !== undefined ? { insertId } : {}),
        };
    }

    streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
        throw new AstromechError('The D1 driver does not support streaming queries.');
    }
}
