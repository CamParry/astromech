/**
 * `entryMutations(type)` run through `useAdminMutation`: each write invalidates
 * the type's keys and toasts its result, bulk restore is one request and reads
 * nothing more, a single restore names every slug that changed in any locale,
 * a staged change that already exists resolves as `null`, and a create counts
 * on the dashboard while an update writes the saved row to its own key.
 *
 * @vitest-environment happy-dom
 */

import { screen, waitFor } from '@testing-library/react';
import { AstromechApiError } from 'astromech/fetch';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { entryMutations, useRestoreEntries } from '@/admin/hooks/entries';
import { useAdminMutation } from '@/admin/hooks/use-admin-mutation';
import { queryKeys } from '@/admin/hooks/use-query-keys';
import { createTestQueryClient, renderAdminHook } from '../_support/render-admin';

const { create, update, restore, publish, createStaged, query } = vi.hoisted(() => ({
    create: vi.fn(),
    update: vi.fn(),
    restore: vi.fn(),
    publish: vi.fn(),
    createStaged: vi.fn(),
    query: vi.fn(),
}));

vi.mock('astromech/fetch', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    astromechUntypedClient: {
        entries: { create, update, restore, publish, createStaged, query },
    },
}));

afterEach(() => {
    create.mockReset();
    update.mockReset();
    restore.mockReset();
    publish.mockReset();
    createStaged.mockReset();
    query.mockReset();
});

type Row = { id: string; locale: string; slug: string };

/** Answer `query` with `trashed` rows before the restore and `live` rows after it. */
function rowsBeforeAndAfter(trashed: Row[], live: Row[]): void {
    query.mockImplementation((params: { trashed: boolean; where: { id: string } }) =>
        Promise.resolve({
            data: (params.trashed ? trashed : live).filter(
                (row) => row.id === params.where.id
            ),
        })
    );
}

/** A retry-free client and the providers the hook needs. */
function mount<T>(hook: () => T) {
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderAdminHook(hook, { queryClient });
    return { result, invalidate, queryClient };
}

describe('entryMutations', () => {
    it.each([
        [
            true,
            'Entries restored as unpublished. An entry whose slug was taken while it was in the trash got a new one.',
        ],
        [
            false,
            'Entries restored. An entry whose slug was taken while it was in the trash got a new one.',
        ],
    ])(
        'restores a selection in one request with no reads (statuses: %s)',
        async (statuses, message) => {
            restore.mockResolvedValue([]);
            const { result, invalidate } = mount(() =>
                useRestoreEntries('post', { name: 'Post', statuses, translatable: false })
            );

            result.current.bulkRestore.mutate(['a', 'b', 'c']);

            expect(await screen.findByText(message)).toBeTruthy();
            expect(restore).toHaveBeenCalledTimes(1);
            expect(restore).toHaveBeenCalledWith({ type: 'post', ids: ['a', 'b', 'c'] });
            expect(query).not.toHaveBeenCalled();
            expect(invalidate).toHaveBeenCalledWith({
                queryKey: queryKeys.entries.all('post'),
            });
        }
    );

    it('names a slug a restore changed in any locale', async () => {
        restore.mockResolvedValue({});
        rowsBeforeAndAfter(
            [
                { id: 'a', locale: 'en', slug: 'same' },
                { id: 'a', locale: 'de', slug: 'same' },
            ],
            [
                { id: 'a', locale: 'en', slug: 'same' },
                { id: 'a', locale: 'de', slug: 'same-2' },
            ]
        );
        const { result } = mount(() =>
            useRestoreEntries('post', {
                name: 'Post',
                statuses: true,
                translatable: true,
            })
        );

        result.current.restore.mutate('a');

        expect(
            await screen.findByText(
                'Post restored as unpublished. A slug was in use, so it is now same-2 (de).'
            )
        ).toBeTruthy();
        expect(restore).toHaveBeenCalledWith({ type: 'post', id: 'a' });
    });

    it('toasts the row that stopped a batch', async () => {
        publish.mockRejectedValue(
            new AstromechApiError({
                id: 'err',
                code: 'validation_failed',
                message: 'Publish failed validation',
                status: 422,
                details: { failedId: 'b' },
            })
        );
        const { result } = mount(() =>
            useAdminMutation(entryMutations('post').bulkPublish)
        );

        result.current.mutate(['a', 'b']);

        expect(await screen.findByText('Publish failed validation (b)')).toBeTruthy();
    });

    it('resolves a staged change that already exists as null', async () => {
        createStaged.mockRejectedValue(
            new AstromechApiError({
                id: 'err',
                code: 'staged_change_exists',
                message: 'A staged change exists',
                status: 409,
            })
        );
        const onSuccess = vi.fn();
        const { result } = mount(() =>
            useAdminMutation(entryMutations('post').createStaged, { onSuccess })
        );

        result.current.mutate({ id: 'e1', locale: 'en' });

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        expect(onSuccess.mock.calls[0]?.[0]).toBeNull();
    });

    it('creates an entry, toasts it and refreshes the type and the dashboard counts', async () => {
        create.mockResolvedValue({ id: 'p1', locale: 'en' });
        const { result, invalidate } = mount(() =>
            useAdminMutation(entryMutations('post', 'Post').create)
        );

        result.current.mutate({ title: 'Hello', fields: {} });

        expect(await screen.findByText('Post created.')).toBeTruthy();
        expect(create).toHaveBeenCalledWith({
            type: 'post',
            data: { title: 'Hello', fields: {} },
        });
        expect(invalidate).toHaveBeenCalledWith({
            queryKey: queryKeys.entries.all('post'),
        });
        expect(invalidate).toHaveBeenCalledWith({
            queryKey: queryKeys.entries.counts(),
        });
    });

    it.each([
        [false, queryKeys.entries.get('post', 'p1', 'en')],
        [true, queryKeys.entries.staged('post', 'p1', 'en')],
    ])(
        'writes the saved row to its own key before refreshing the type (staged: %s)',
        async (staged, key) => {
            const saved = { id: 'p1', locale: 'en', title: 'Saved' };
            update.mockResolvedValue(saved);
            const { result, invalidate, queryClient } = mount(() =>
                useAdminMutation(entryMutations('post', 'Post').update)
            );
            // The row is in the cache by the time the type's keys go stale.
            let seeded: unknown;
            invalidate.mockImplementation(() => {
                seeded ??= queryClient.getQueryData(key);
                return Promise.resolve();
            });

            result.current.mutate({ id: 'p1', locale: 'en', staged, data: {} });

            expect(await screen.findByText('Post updated.')).toBeTruthy();
            expect(update).toHaveBeenCalledWith({
                type: 'post',
                id: 'p1',
                locale: 'en',
                staged,
                data: {},
            });
            expect(seeded).toEqual(saved);
        }
    );
});
