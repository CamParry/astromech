/**
 * Hand-written Kysely dialect for Cloudflare D1.
 *
 * Not `kysely-d1`: that package hard-throws on `db.transaction()` (fine — D1
 * genuinely has none), but it also pins `kysely: "*"`, is single-maintainer/
 * lightly-maintained, and — the real blocker — resolves its `D1Database`
 * synchronously at construction. `d1({ binding: 'DB' })` needs the binding
 * resolved lazily and asynchronously (see `@/cloudflare/bindings.js`), which
 * only a dialect we own can do while keeping `getInstance()` synchronous.
 *
 * D1 itself has no interactive transactions — `batch()` is its only atomicity
 * primitive, and it cannot interleave application logic between statements —
 * so `beginTransaction`/`commitTransaction`/`rollbackTransaction` throw. SQL
 * generation is otherwise ordinary SQLite, so this reuses Kysely's
 * `SqliteAdapter`/`SqliteQueryCompiler` and supplies the D1-specific
 * `Driver`/`DatabaseConnection` pair. Introspection needs its own
 * implementation — see `D1Introspector` for the query D1's authorizer rejects.
 */

import {
    SqliteAdapter,
    SqliteQueryCompiler,
    type CompiledQuery,
    type DatabaseConnection,
    type DatabaseIntrospector,
    type Dialect,
    type Driver,
    type Kysely,
    type QueryCompiler,
    type QueryResult,
} from 'kysely';
import { D1Introspector } from './d1-introspector.js';

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
    '[Astromech] Cloudflare D1 has no interactive transactions (batch() is its only ' +
    'atomicity primitive). The d1() driver declares supportsTransactions: false so entry ' +
    'storage degrades to sequential writes — reaching this error means something called ' +
    'db.transaction() directly.';

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
        throw new Error(NO_TRANSACTIONS_ERROR);
    }

    async commitTransaction(): Promise<void> {
        throw new Error(NO_TRANSACTIONS_ERROR);
    }

    async rollbackTransaction(): Promise<void> {
        throw new Error(NO_TRANSACTIONS_ERROR);
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
            throw new Error(`[Astromech] D1 query failed: ${result.error}`);
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
        throw new Error('[Astromech] The D1 driver does not support streaming queries.');
    }
}
