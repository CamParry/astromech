/**
 * `useMediaVersions` and `mediaMutations().restoreVersion` address one
 * locale's content row, so the locale travels with every call, and a restore
 * invalidates the media keys, which hold the item's versions.
 *
 * @vitest-environment happy-dom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import i18n from 'i18next';
import React from 'react';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/admin/components/ui/toast';
import { mediaMutations, useMediaVersions } from '@/admin/hooks/media';
import { useAdminMutation } from '@/admin/hooks/use-admin-mutation';
import { queryKeys } from '@/admin/hooks/use-query-keys';
import en from '@/admin/locales/en.json';

const { versions, restoreVersion } = vi.hoisted(() => ({
    versions: vi.fn(),
    restoreVersion: vi.fn(),
}));

vi.mock('astromech/fetch', () => ({
    astromechUntypedClient: { media: { versions, restoreVersion } },
}));

beforeAll(async () => {
    await i18n.use(initReactI18next).init({
        lng: 'en',
        resources: { en: { translation: en } },
        interpolation: { escapeValue: false },
    });
});

afterEach(() => {
    versions.mockReset();
    restoreVersion.mockReset();
});

/** A retry-free client, plus the wrapper both hooks need. */
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

describe('useMediaVersions', () => {
    it('asks for the locale it was given', async () => {
        versions.mockResolvedValue([]);

        const { result } = mount(() => useMediaVersions('m1', 'fr'));

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(versions).toHaveBeenCalledWith({ id: 'm1', locale: 'fr' });
    });

    it('does not fetch while disabled', () => {
        mount(() => useMediaVersions('m1', 'fr', false));

        expect(versions).not.toHaveBeenCalled();
    });
});

describe('mediaMutations().restoreVersion', () => {
    it('restores into the locale and invalidates the item', async () => {
        restoreVersion.mockResolvedValue({ id: 'm1' });
        const onSuccess = vi.fn();
        const { result, invalidate } = mount(() =>
            useAdminMutation(mediaMutations().restoreVersion, { onSuccess })
        );

        result.current.mutate({ id: 'm1', locale: 'fr', versionId: 'v2' });

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        expect(restoreVersion).toHaveBeenCalledWith({
            id: 'm1',
            locale: 'fr',
            versionId: 'v2',
        });
        expect(invalidate).toHaveBeenCalledWith({
            queryKey: queryKeys.media.all(),
        });
    });
});
