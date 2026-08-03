/**
 * @vitest-environment happy-dom
 *
 * A bare `await` loop abandoned every id after the first rejection and skipped
 * the cache invalidation, so the library kept showing files that were gone.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, screen, waitFor } from '@testing-library/react';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { ToastProvider } from '@/admin/components/ui/toast.js';
import { useBulkDeleteMedia } from '@/admin/hooks/media.js';
import { queryKeys } from '@/admin/hooks/use-query-keys.js';
import en from '@/admin/locales/en.json';

const { deleteMedia } = vi.hoisted(() => ({ deleteMedia: vi.fn() }));

vi.mock('@/transport/http/client/index.js', () => ({
    Astromech: { media: { delete: deleteMedia } },
}));

beforeAll(async () => {
    // Toasts are asserted by their rendered text, so real strings are needed;
    // the SPA's own i18n module pulls in virtual modules, so stand up a bare one.
    await i18n.use(initReactI18next).init({
        lng: 'en',
        resources: { en: { translation: en } },
        interpolation: { escapeValue: false },
    });
});

afterEach(() => {
    cleanup();
    deleteMedia.mockReset();
});

const IDS = ['a', 'b', 'c', 'd', 'e'];

type Mounted = {
    remove: (ids: string[]) => void;
    onSuccess: ReturnType<typeof vi.fn>;
    invalidate: ReturnType<typeof vi.spyOn>;
};

/** Mount the hook over a retry-free client, watching the cache invalidation. */
function mountHook(): Mounted {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const onSuccess = vi.fn();

    const { result } = renderHook(() => useBulkDeleteMedia({ onSuccess }), {
        wrapper: ({ children }: { children: React.ReactNode }) => (
            <QueryClientProvider client={queryClient}>
                <ToastProvider>{children}</ToastProvider>
            </QueryClientProvider>
        ),
    });

    return {
        remove: (ids) => act(() => result.current.mutate(ids)),
        onSuccess,
        invalidate,
    };
}

/** Delete resolves for every id except these. */
function rejectIds(failing: string[]): void {
    deleteMedia.mockImplementation(({ id }: { id: string }) =>
        failing.includes(id) ? Promise.reject(new Error('gone')) : Promise.resolve()
    );
}

/** The variant class Base UI's toast root carries for the toast holding `text`. */
function toastVariant(text: string): string | undefined {
    const root = screen.getByText(text).closest('.am-toast');
    return [...(root?.classList ?? [])].find((name) => name.startsWith('am-toast-'));
}

describe('useBulkDeleteMedia partial failure', () => {
    it('attempts every id even after one rejects', async () => {
        rejectIds(['b', 'd']);
        const mounted = mountHook();

        mounted.remove(IDS);

        await waitFor(() => expect(mounted.onSuccess).toHaveBeenCalled());
        expect(deleteMedia).toHaveBeenCalledTimes(5);
    });

    it('reports only the ids that were actually deleted', async () => {
        rejectIds(['b', 'd']);
        const mounted = mountHook();

        mounted.remove(IDS);

        await waitFor(() =>
            expect(mounted.onSuccess).toHaveBeenCalledWith(['a', 'c', 'e'])
        );
    });

    it('invalidates the media cache despite the failures', async () => {
        rejectIds(['b', 'd']);
        const mounted = mountHook();

        mounted.remove(IDS);

        await waitFor(() =>
            expect(mounted.invalidate).toHaveBeenCalledWith({
                queryKey: queryKeys.media.all(),
            })
        );
    });

    it('warns about the shortfall rather than claiming a clean run', async () => {
        rejectIds(['b', 'd']);
        const mounted = mountHook();

        mounted.remove(IDS);

        await screen.findByText('Deleted 3 of 5 files.');
        expect(toastVariant('Deleted 3 of 5 files.')).toBe('am-toast-warning');
    });
});

describe('useBulkDeleteMedia clean run', () => {
    it('reports every id', async () => {
        rejectIds([]);
        const mounted = mountHook();

        mounted.remove(IDS);

        await waitFor(() => expect(mounted.onSuccess).toHaveBeenCalledWith(IDS));
        expect(deleteMedia).toHaveBeenCalledTimes(5);
    });

    it('toasts success rather than the partial message', async () => {
        rejectIds([]);
        const mounted = mountHook();

        mounted.remove(IDS);

        await screen.findByText('5 files deleted.');
        expect(toastVariant('5 files deleted.')).toBe('am-toast-success');
        expect(screen.queryByText(/Deleted 5 of 5/)).toBeNull();
    });
});
