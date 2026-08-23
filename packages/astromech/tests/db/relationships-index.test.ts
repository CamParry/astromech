/**
 * Integration tests for the relationships index repository against a real (temp
 * file) database. Covers the wholesale replace and its INSERT chunking.
 */

import type { RelationshipEdge } from '@/fields/relationship-edges';
import { createTestDb } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/database/registry';
import { createRelationshipRepository } from '@/database/repository/relationships';

const SOURCE = { id: 'src-1', kind: 'entry', type: 'post' } as const;

/** `n` distinct edges under one schema path. */
function edges(n: number): RelationshipEdge[] {
    return Array.from({ length: n }, (_, i) => ({
        schemaPath: 'related',
        instancePath: 'related',
        targetId: `t${i}`,
        targetKind: 'entry' as const,
    }));
}

function repository(): ReturnType<typeof createRelationshipRepository> {
    return createRelationshipRepository(getDb());
}

beforeEach(async () => {
    await createTestDb();
});

describe('replaceForSource', () => {
    it('writes one row per edge, stamped with the source columns', async () => {
        await repository().replaceForSource(SOURCE, edges(1));

        const rows = await repository().findBySource(SOURCE.id, 'entry');
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            sourceId: 'src-1',
            sourceKind: 'entry',
            sourceType: 'post',
            schemaPath: 'related',
            instancePath: 'related',
            targetId: 't0',
            targetKind: 'entry',
            sourceStaged: false,
        });
    });

    it('narrows three edges to one', async () => {
        await repository().replaceForSource(SOURCE, edges(3));
        await repository().replaceForSource(SOURCE, edges(1));

        const rows = await repository().findBySource(SOURCE.id, 'entry');
        expect(rows.map((r) => r.targetId)).toEqual(['t0']);
    });

    // The old subsystem skipped a falsy field value, so clearing a single
    // relation left its row in place.
    it('leaves no rows when the edge set is empty', async () => {
        await repository().replaceForSource(SOURCE, edges(3));
        await repository().replaceForSource(SOURCE, []);

        expect(await repository().findBySource(SOURCE.id, 'entry')).toEqual([]);
    });

    it('touches no other source', async () => {
        await repository().replaceForSource(SOURCE, edges(2));
        await repository().replaceForSource({ id: 'src-2', kind: 'entry' }, edges(1));
        await repository().replaceForSource(SOURCE, []);

        expect(await repository().findBySource('src-2', 'entry')).toHaveLength(1);
    });

    // 12 rows per INSERT is the largest statement that fits D1's parameter cap.
    it('lands every row when the edge set spans multiple INSERT chunks', async () => {
        await repository().replaceForSource(SOURCE, edges(29));

        const rows = await repository().findBySource(SOURCE.id, 'entry');
        expect(rows).toHaveLength(29);
        expect(new Set(rows.map((r) => r.targetId)).size).toBe(29);
    });

    it('records the staged flag so reverse lookup can exclude staged sources', async () => {
        await repository().replaceForSource(
            { id: 'staged-1', kind: 'entry', type: 'post', staged: true },
            edges(1)
        );

        expect(await repository().findByTarget('t0', 'entry')).toEqual([]);
        expect(
            await repository().findByTarget('t0', 'entry', { includeStaged: true })
        ).toHaveLength(1);
    });
});

describe('deleteByResource', () => {
    it('drops edges in both directions', async () => {
        await repository().replaceForSource(SOURCE, edges(1));
        await repository().replaceForSource({ id: 'other', kind: 'entry' }, [
            {
                schemaPath: 'related',
                instancePath: 'related',
                targetId: 'src-1',
                targetKind: 'entry',
            },
        ]);

        await repository().deleteByResource('src-1', 'entry');

        expect(await repository().findBySource('src-1', 'entry')).toEqual([]);
        expect(await repository().findBySource('other', 'entry')).toEqual([]);
    });
});
