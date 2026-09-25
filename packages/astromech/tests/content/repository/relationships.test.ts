/**
 * Integration tests for the relationships index repository against a real (temp
 * file) database. Covers the wholesale replace and its INSERT chunking.
 */

import type { FieldReference } from '@/fields/references';
import { createTestDb } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { relationshipRepository } from '@/content/repository/relationships';

const SOURCE = { id: 'src-1', kind: 'entry', type: 'post' } as const;

/** `n` distinct references under one schema path. */
function references(n: number): FieldReference[] {
    return Array.from({ length: n }, (_, i) => ({
        schemaPath: 'related',
        instancePath: 'related',
        targetId: `t${i}`,
        targetKind: 'entry' as const,
    }));
}

beforeEach(async () => {
    await createTestDb();
});

describe('replaceForSource', () => {
    it('writes one row per reference, stamped with the source columns', async () => {
        await relationshipRepository.replaceForSource(SOURCE, references(1));

        const rows = await relationshipRepository.findBySource(SOURCE.id, 'entry');
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

    it('narrows three references to one', async () => {
        await relationshipRepository.replaceForSource(SOURCE, references(3));
        await relationshipRepository.replaceForSource(SOURCE, references(1));

        const rows = await relationshipRepository.findBySource(SOURCE.id, 'entry');
        expect(rows.map((r) => r.targetId)).toEqual(['t0']);
    });

    // The old subsystem skipped a falsy field value, so clearing a single
    // relation left its row in place.
    it('leaves no rows when there are no references', async () => {
        await relationshipRepository.replaceForSource(SOURCE, references(3));
        await relationshipRepository.replaceForSource(SOURCE, []);

        expect(await relationshipRepository.findBySource(SOURCE.id, 'entry')).toEqual([]);
    });

    it('touches no other source', async () => {
        await relationshipRepository.replaceForSource(SOURCE, references(2));
        await relationshipRepository.replaceForSource(
            { id: 'src-2', kind: 'entry' },
            references(1)
        );
        await relationshipRepository.replaceForSource(SOURCE, []);

        expect(await relationshipRepository.findBySource('src-2', 'entry')).toHaveLength(
            1
        );
    });

    // 12 rows per INSERT is the largest statement that fits D1's parameter cap.
    it('lands every row when the references span multiple INSERT chunks', async () => {
        await relationshipRepository.replaceForSource(SOURCE, references(29));

        const rows = await relationshipRepository.findBySource(SOURCE.id, 'entry');
        expect(rows).toHaveLength(29);
        expect(new Set(rows.map((r) => r.targetId)).size).toBe(29);
    });

    it('records the staged flag so reverse lookup can exclude staged sources', async () => {
        await relationshipRepository.replaceForSource(
            { id: 'staged-1', kind: 'entry', type: 'post', staged: true },
            references(1)
        );

        expect(await relationshipRepository.findByTarget('t0', 'entry')).toEqual([]);
        expect(
            await relationshipRepository.findByTarget('t0', 'entry', {
                includeStaged: true,
            })
        ).toHaveLength(1);
    });
});

describe('deleteByResource', () => {
    it('drops references in both directions', async () => {
        await relationshipRepository.replaceForSource(SOURCE, references(1));
        await relationshipRepository.replaceForSource({ id: 'other', kind: 'entry' }, [
            {
                schemaPath: 'related',
                instancePath: 'related',
                targetId: 'src-1',
                targetKind: 'entry',
            },
        ]);

        await relationshipRepository.deleteByResource('src-1', 'entry');

        expect(await relationshipRepository.findBySource('src-1', 'entry')).toEqual([]);
        expect(await relationshipRepository.findBySource('other', 'entry')).toEqual([]);
    });
});
