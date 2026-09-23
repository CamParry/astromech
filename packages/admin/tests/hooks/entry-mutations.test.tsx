/**
 * `entryMutations(type)` run through `useAdminMutation`: each write invalidates
 * the type's keys and toasts its result, bulk restore is one request, and a
 * staged change that already exists resolves as `null`.
 *
 * @vitest-environment happy-dom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, screen, waitFor } from '@testing-library/react';
import { AstromechApiError } from 'astromech/fetch';
import i18n from 'i18next';
import React from 'react';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/admin/components/ui/toast';
import { entryMutations } from '@/admin/hooks/entries';
import { useAdminMutation } from '@/admin/hooks/use-admin-mutation';
import { queryKeys } from '@/admin/hooks/use-query-keys';
import en from '@/admin/locales/en.json';

const { restore, publish, createStaged } = vi.hoisted(() => ({
    restore: vi.fn(),
    publish: vi.fn(),
    createStaged: vi.fn(),
}));

vi.mock('astromech/fetch', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    astromechUntypedClient: { entries: { restore, publish, createStaged } },
}));

beforeAll(async () => {
    await i18n.use(initReactI18next).init({
        lng: 'en',
        resources: { en: { translation: en } },
        interpolation: { escapeValue: false },
    });
});

afterEach(() => {
    restore.mockReset();
    publish.mockReset();
    createStaged.mockReset();
});

/** A retry-free client and the providers the hook needs. */
function mount<T>(hook: () => T) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(hook, {
        wrapper: ({ children }: { children: React.ReactNode }) => (
            <QueryClientProvider client={queryClient}>
                <ToastProvider>{children}</ToastProvider>
            </QueryClientProvider>
        ),
    });
    return { result, invalidate };
}

describe('entryMutations', () => {
    it('restores a selection in one request and invalidates the type', async () => {
        restore.mockResolvedValue([]);
        const onSuccess = vi.fn();
        const { result, invalidate } = mount(() =>
            useAdminMutation(entryMutations('post').bulkRestore, { onSuccess })
        );

        result.current.mutate(['a', 'b', 'c']);

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        expect(restore).toHaveBeenCalledTimes(1);
        expect(restore).toHaveBeenCalledWith({ type: 'post', ids: ['a', 'b', 'c'] });
        expect(invalidate).toHaveBeenCalledWith({
            queryKey: queryKeys.entries.all('post'),
        });
        expect(await screen.findByText('Entries restored.')).toBeTruthy();
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
});
