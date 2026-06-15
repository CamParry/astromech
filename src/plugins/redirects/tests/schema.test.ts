/**
 * Migration smoke test: verifies that migration 0006 creates
 * plugin_redirects_redirects and the DELETE cleanup runs without error.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { createTestDb } from '@/test/harness.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: LibSQLDatabase<any>;

beforeAll(async () => {
    db = await createTestDb();
});

describe('migration 0006 — plugin_redirects_redirects', () => {
    it('creates the plugin_redirects_redirects table', async () => {
        const rows = await db.all(
            sql`SELECT name FROM sqlite_master WHERE type='table' AND name='plugin_redirects_redirects'`
        );
        expect(rows).toHaveLength(1);
        expect((rows[0] as Record<string, unknown>)['name']).toBe(
            'plugin_redirects_redirects'
        );
    });

    it('entries table still exists after cleanup DELETE', async () => {
        const rows = await db.all(
            sql`SELECT name FROM sqlite_master WHERE type='table' AND name='entries'`
        );
        expect(rows).toHaveLength(1);
    });
});
