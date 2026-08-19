/**
 * Migration smoke test: verifies that migration 0006 creates
 * plugin_redirects_redirects and the DELETE cleanup runs without error.
 */

import type { DB } from '@/database/types';
import type { Kysely } from 'kysely';
import { createTestDb } from '@tests/harness';
import { sql } from 'kysely';
import { beforeAll, describe, expect, it } from 'vitest';

let db: Kysely<DB>;

beforeAll(async () => {
    db = await createTestDb();
});

describe('migration 0006 — plugin_redirects_redirects', () => {
    it('creates the plugin_redirects_redirects table', async () => {
        const { rows } =
            await sql`SELECT name FROM sqlite_master WHERE type='table' AND name='plugin_redirects_redirects'`.execute(
                db
            );
        expect(rows).toHaveLength(1);
        expect((rows[0] as Record<string, unknown>)['name']).toBe(
            'plugin_redirects_redirects'
        );
    });

    it('entries table still exists after cleanup DELETE', async () => {
        const { rows } =
            await sql`SELECT name FROM sqlite_master WHERE type='table' AND name='entries'`.execute(
                db
            );
        expect(rows).toHaveLength(1);
    });
});
