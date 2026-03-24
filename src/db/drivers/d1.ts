/**
 * Cloudflare D1 Database Driver
 *
 * For Cloudflare Workers deployments. The D1 binding is available
 * per-request via `context.env.DB`.
 *
 * Usage:
 *   import { d1Driver } from 'astromech';
 *   db: d1Driver()
 *
 * Note: D1 support requires a Cloudflare Workers deployment target.
 * The binding name defaults to 'DB' and can be overridden.
 */

/// <reference types="@cloudflare/workers-types" />

import type { LibSQLDatabase } from 'drizzle-orm/libsql';

type D1DriverOptions = {
    bindingName?: string;
};

export function d1Driver(_options?: D1DriverOptions) {
    return {
        type: 'd1' as const,
        getInstance(): LibSQLDatabase {
            // D1 requires per-request initialization from Cloudflare bindings.
            // Full D1 support will be wired up when the Cloudflare Workers
            // deployment target is implemented.
            throw new Error(
                'D1 driver requires per-request initialization. ' +
                    'Use libsqlDriver() for local development.'
            );
        },
    };
}
