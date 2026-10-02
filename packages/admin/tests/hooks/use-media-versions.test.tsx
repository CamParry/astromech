/**
 * `useMediaVersions` and `mediaMutations().restoreVersion` address one
 * locale's content row, so the locale travels with every call, and a restore
 * invalidates the media keys, which hold the item's versions.
 *
 * @vitest-environment happy-dom
 */

import { waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mediaMutations, useMediaVersions } from '@/admin/hooks/media';
import { useAdminMutation } from '@/admin/hooks/use-admin-mutation';
import { queryKeys } from '@/admin/hooks/use-query-keys';
import { createTestQueryClient, renderAdminHook } from '../_support/render-admin';

const { versions, restoreVersion } = vi.hoisted(() => ({
    versions: vi.fn(),
    restoreVersion: vi.fn(),
}));

vi.mock('astromech/fetch', () => ({
    astromechUntypedClient: { media: { versions, restoreVersion } },
}));

afterEach(() => {
    versions.mockReset();
    restoreVersion.mockReset();
});

/** A retry-free client, plus the wrapper both hooks need. */
function mount<T>(hook: () => T) {
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderAdminHook(hook, { queryClient });
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

        result.current.mutate({ id: 'm1', locale: 'fr', version: 2 });

        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        expect(restoreVersion).toHaveBeenCalledWith({
            id: 'm1',
            locale: 'fr',
            version: 2,
        });
        expect(invalidate).toHaveBeenCalledWith({
            queryKey: queryKeys.media.all(),
        });
    });
});
