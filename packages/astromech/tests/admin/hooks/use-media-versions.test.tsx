/**
 * `useMediaVersions` and `useRestoreMediaVersion` address one locale's content
 * row, so the locale travels with every call and a restore invalidates the
 * whole item — the versions key sits under the detail prefix.
 *
 * @vitest-environment happy-dom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import i18n from 'i18next';
import React from 'react';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/admin/components/ui/toast';
import { useMediaVersions, useRestoreMediaVersion } from '@/admin/hooks/media';
import { queryKeys } from '@/admin/hooks/use-query-keys';
import en from '@/admin/locales/en.json';

const { versions, restoreVersion } = vi.hoisted(() => ({
    versions: vi.fn(),
    restoreVersion: vi.fn(),
}));

vi.mock('@/transport/http/client', () => ({
    astromechClient: { media: { versions, restoreVersion } },
}));

beforeAll(async () => {
    await i18n.use(initReactI18next).init({
        lng: 'en',
        resources: { en: { translation: en } },
        interpolation: { escapeValue: false },
    });
});

afterEach(() => {
    cleanup();
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

describe('useRestoreMediaVersion', () => {
    it('restores into the locale and invalidates the item', async () => {
        restoreVersion.mockResolvedValue({ id: 'm1' });
        const onSuccess = vi.fn();
        const { result, invalidate } = mount(() =>
            useRestoreMediaVersion('m1', 'fr', { onSuccess })
        );

        result.current.mutate('v2');

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        expect(restoreVersion).toHaveBeenCalledWith({
            id: 'm1',
            locale: 'fr',
            versionId: 'v2',
        });
        expect(invalidate).toHaveBeenCalledWith({
            queryKey: queryKeys.media.detailPrefix('m1'),
        });
    });
});
