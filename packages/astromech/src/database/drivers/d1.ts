/**
 * Cloudflare D1 Database Driver
 *
 * Usage:
 *   import { d1 } from 'astromech/database/d1';
 *   db: d1({ binding: 'DB' })
 *
 * Two permanent caveats, both driven by what D1 actually exposes:
 *   - No interactive transactions. `batch()` is D1's only atomicity primitive
 *     and cannot interleave application logic, so this driver declares
 *     `supportsTransactions: false` and entry storage degrades to sequential
 *     writes rather than pretending to support `db.transaction()`.
 *   - No `dump`/`restore`. D1 export is control-plane only (`wrangler d1
 *     export`, the REST API, Time Travel) — there is no in-process snapshot
 *     API to call. The backups plugin feature-detects the missing methods and
 *     reports `canDump: false` with an explanatory error instead of assuming
 *     every driver can dump.
 */

import { Kysely, CamelCasePlugin } from 'kysely';
import { resolveBinding } from '@/cloudflare/bindings';
import { D1Dialect, type D1DatabaseLike } from './d1-dialect';
import type { DB } from '@/database/types';

export type { D1DatabaseLike, D1PreparedStatementLike, D1ResultLike } from './d1-dialect';

export type D1Options =
    | { binding: string; database?: never }
    | { database: D1DatabaseLike; binding?: never };

export function d1(options: D1Options) {
    // Resolution must never happen at construction — a plain `database` is
    // already resolved, but a `binding` name is only looked up lazily, on
    // first use, and memoised so concurrent calls share one resolution.
    let pending: Promise<D1DatabaseLike> | undefined;
    function resolveDatabase(): Promise<D1DatabaseLike> {
        if ('binding' in options) {
            // A failed lookup is dropped rather than memoised, matching the
            // resolver: a caller that supplies the environment afterwards must
            // still recover instead of being stuck with the first rejection.
            pending ??= resolveBinding<D1DatabaseLike>(options.binding).catch(
                (err: unknown) => {
                    pending = undefined;
                    throw err;
                }
            );
            return pending;
        }
        return Promise.resolve(options.database);
    }

    function createDialect(): D1Dialect {
        return new D1Dialect({ database: resolveDatabase });
    }

    let instance: Kysely<DB> | null = null;

    function getInstance(): Kysely<DB> {
        // Must stay synchronous: the binding only resolves once a query
        // actually runs, inside `D1Driver.acquireConnection()` (already
        // async), not here.
        if (!instance) {
            instance = new Kysely<DB>({
                dialect: createDialect(),
                plugins: [new CamelCasePlugin()],
            });
        }
        return instance;
    }

    return {
        type: 'd1' as const,
        getInstance,
        createDialect,
        supportsTransactions: false,

        // Always remote: D1 is only reachable through a binding, and nothing
        // here distinguishes a dev binding from the production database.
        isRemote: () => true,
    };
}
