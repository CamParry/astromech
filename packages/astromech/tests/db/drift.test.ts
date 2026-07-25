/**
 * Drift gate — "`db:generate` produces no new migration" as a vitest test, so
 * CI gets it for free (`specs/data-layer.md` §"Step 4", #11b).
 *
 * Reads the COMMITTED `apps/demo/migrations/snapshot.json` and diffs it
 * against a fresh snapshot built from the live `CORE_TABLES` descriptors. If
 * this ever produces ops, someone changed a descriptor without running
 * `db:generate` (or committing its output) — the fix is to run
 * `npm run db:generate` and commit the result, not to edit this test.
 */

import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { diffSnapshots } from '@astromech/schema-engine';
import { createSnapshot, type Snapshot } from '@/database/descriptor-snapshot.js';
import { CORE_TABLES } from '@/database/schema.js';

describe('migrations/snapshot.json drift gate', () => {
    it('the committed snapshot matches the live descriptors — db:generate would produce nothing', async () => {
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
