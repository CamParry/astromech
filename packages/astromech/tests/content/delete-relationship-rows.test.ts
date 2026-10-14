/**
 * Every repository delete drops the deleted resource's relationship rows, in
 * both directions, with the row itself. The rows have no FK to cascade on, so
 * nothing else would clear them.
 */

import type { TargetType } from '@/types/domain';
import { createTestDb, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { relationshipRepository } from '@/content/repository/relationships';
import { transaction } from '@/database/transaction';
import { entryRepository } from '@/entries/repository/entries-table';
import { entryMaintenanceRepository } from '@/entries/repository/maintenance';
import { mediaRepository } from '@/media/repository';
import { DEFAULT_ROLE_SLUG } from '@/permissions/roles';
import { userRepository } from '@/users/repository';

beforeEach(async () => {
    await createTestDb();
    setupTestConfig();
});

/** A live post; answers its id. */
async function post(title: string): Promise<string> {
    return (await entryRepository.create({ type: 'post', title, slug: null })).id;
}

/** A trashed post; answers its id. */
async function trashedPost(): Promise<string> {
    const id = await post('Doomed');
    await entryRepository.trash.trash(id);
    return id;
}

type DeletePath = {
    name: string;
    type: TargetType;
    /** Creates the resource to delete; answers its id. */
    arrange: () => Promise<string>;
    /** Deletes it through the path under test. */
    act: (id: string) => Promise<unknown>;
};

const paths: DeletePath[] = [
    {
        name: 'entryRepository.delete',
        type: 'entry',
        arrange: () => post('Doomed'),
        act: (id) => transaction(() => entryRepository.delete(id)),
    },
    {
        name: 'entryRepository.trash.emptyTrash',
        type: 'entry',
        arrange: trashedPost,
        act: () => entryRepository.trash.emptyTrash('post'),
    },
    {
        name: 'entryMaintenanceRepository.purgeTrashedBefore',
        type: 'entry',
        arrange: trashedPost,
        act: () =>
            entryMaintenanceRepository.purgeTrashedBefore(new Date(Date.now() + 60_000)),
    },
    {
        name: 'mediaRepository.delete',
        type: 'media',
        async arrange() {
            const row = await mediaRepository.create(
                { filename: 'a.png', mimeType: 'image/png', size: 1 },
                {}
            );
            return row.id;
        },
        act: (id) => transaction(() => mediaRepository.delete(id)),
    },
    {
        name: 'userRepository.delete',
        type: 'user',
        async arrange() {
            const row = await userRepository.create(
                { email: 'gone@test.dev', name: 'Gone', role: DEFAULT_ROLE_SLUG },
                { fields: {} }
            );
            return row.id;
        },
        async act(id) {
            expect(await transaction(() => userRepository.delete(id))).toBe('deleted');
        },
    },
];

describe.each(paths)('$name', ({ type, arrange, act }) => {
    it('drops the rows from and to the deleted resource, and no others', async () => {
        const doomed = await arrange();
        const survivor = await post('Survivor');
        await relationshipRepository.replaceForSource(
            { id: doomed, type, subtype: type === 'entry' ? 'post' : null },
            [
                {
                    locale: 'en',
                    schemaPath: 'related',
                    instancePath: 'related',
                    targetId: survivor,
                    targetType: 'entry',
                },
            ]
        );
        await relationshipRepository.replaceForSource(
            { id: survivor, type: 'entry', subtype: 'post' },
            [
                {
                    locale: 'en',
                    schemaPath: 'related',
                    instancePath: 'related[0]',
                    targetId: doomed,
                    targetType: type,
                },
                {
                    locale: 'en',
                    schemaPath: 'related',
                    instancePath: 'related[1]',
                    targetId: survivor,
                    targetType: 'entry',
                },
            ]
        );

        await act(doomed);

        expect(await relationshipRepository.findBySource(doomed, type)).toEqual([]);
        expect(
            await relationshipRepository.findByTarget(doomed, type, {
                includeStaged: true,
            })
        ).toEqual([]);
        const kept = await relationshipRepository.findBySource(survivor, 'entry');
        expect(kept.map((row) => row.targetId)).toEqual([survivor]);
    });
});
