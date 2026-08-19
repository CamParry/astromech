/**
 * Drift gate — "`db:generate` produces no new migration" as a vitest test, so
 * CI gets it for free.
 *
 * Reads the COMMITTED `apps/demo/migrations/snapshot.json` and diffs it
 * against a fresh snapshot built from the live `CORE_TABLES`. If
 * this ever produces ops, someone changed a table without running
 * `db:generate` (or committing its output) — the fix is to run
 * `npm run db:generate` and commit the result, not to edit this test.
 */
import type { Snapshot } from '@/database/table-snapshot';
import { readFile } from 'node:fs/promises';
import { diffSnapshots } from '@astromech/schema-engine';
import { describe, expect, it } from 'vitest';
import { CORE_TABLES } from '@/database/schema';
import { createSnapshot } from '@/database/table-snapshot';

describe('migrations/snapshot.json drift gate', () => {
    it('the committed snapshot matches the live tables — db:generate would produce nothing', async () => {
        const snapshotUrl = new URL(
            '../../../../apps/demo/migrations/snapshot.json',
            import.meta.url
        );
        const committed = JSON.parse(await readFile(snapshotUrl, 'utf-8')) as Snapshot;
        const live = createSnapshot(CORE_TABLES, { dialect: 'sqlite' });

        const result = diffSnapshots(committed, live);

        expect(result.ops).toEqual([]);
        expect(result.errors).toEqual([]);
        expect(result.warnings).toEqual([]);
    });
});
