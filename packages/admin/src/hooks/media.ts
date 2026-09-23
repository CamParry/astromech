/**
 * Queries and mutations for media. `mediaMutations()` is the table of writes,
 * each naming the keys it invalidates and its toasts; `useAdminMutation` runs
 * them. Upload lives in `use-upload-media.ts`.
 */

import type { UseMutationResult } from '@tanstack/react-query';
import type { MediaQueryParams } from 'astromech';
import { mutationOptions, queryOptions, useQuery } from '@tanstack/react-query';
import { astromechUntypedClient } from 'astromech/fetch';
import { useTranslation } from 'react-i18next';
import { useToast } from '../components/ui/toast';
import { useAdminMutation } from './use-admin-mutation';
import { queryKeys } from './use-query-keys';

export function useMediaQuery(params?: MediaQueryParams) {
    return useQuery({
        queryKey: queryKeys.media.list(params as Record<string, unknown>),
        queryFn: () => astromechUntypedClient.media.query(params),
    });
}

/**
 * One media item, in `locale` when given. A locale with no content row reads
 * back the default locale's content, so every locale is its own cache entry.
 */
function mediaItemQueryOptions(id: string, locale?: string) {
    return queryOptions({
        queryKey: queryKeys.media.detail(id, locale),
        queryFn: () =>
            astromechUntypedClient.media.get({
                id,
                ...(locale !== undefined ? { locale } : {}),
            }),
    });
}

export function useMediaItem(id: string, enabled = true, locale?: string) {
    return useQuery({ ...mediaItemQueryOptions(id, locale), enabled });
}

/** One locale's saved versions of a media item, newest last. */
function mediaVersionsQueryOptions(id: string, locale: string) {
    return queryOptions({
        queryKey: queryKeys.media.versions(id, locale),
        queryFn: () => astromechUntypedClient.media.versions({ id, locale }),
    });
}

export function useMediaVersions(id: string, locale: string, enabled = true) {
    return useQuery({ ...mediaVersionsQueryOptions(id, locale), enabled });
}

/** Read-only: every reference to this media item, from any resource. */
export function useMediaUsage(id: string, enabled = true) {
    return useQuery({
        queryKey: queryKeys.media.usedBy(id),
        queryFn: () => astromechUntypedClient.media.usedBy({ id }),
        enabled,
    });
}

/**
 * Every write the admin makes to media. A write to one locale with no row
 * creates it, and a replace keeps the id and URL, so each invalidates the whole
 * library: the item's locales, its versions and the lists.
 */
export function mediaMutations() {
    const media = astromechUntypedClient.media;
    const invalidates = [queryKeys.media.all()];
    return {
        update: mutationOptions({
            mutationKey: ['media', 'update'],
            mutationFn: ({
                id,
                locale,
                data,
            }: {
                id: string;
                locale?: string | undefined;
                data: Record<string, unknown>;
            }) => media.update({ id, ...(locale !== undefined ? { locale } : {}), data }),
            meta: {
                invalidates,
                successMessage: 'media.saved',
                errorMessage: 'media.saveFailed',
            },
        }),
        replace: mutationOptions({
            mutationKey: ['media', 'replace'],
            mutationFn: ({ id, file }: { id: string; file: File }) =>
                media.replace({ id, file }),
            meta: {
                invalidates,
                successMessage: 'media.replaced',
                errorMessage: 'media.replaceFailed',
            },
        }),
        delete: mutationOptions({
            mutationKey: ['media', 'delete'],
            mutationFn: (id: string) => media.delete({ id }),
            meta: {
                invalidates,
                successMessage: 'media.deleted',
                errorMessage: 'media.deleteFailed',
            },
        }),
        /**
         * Delete each id on its own so one failure leaves the rest deletable;
         * the caller reports how many went.
         */
        bulkDelete: mutationOptions({
            mutationKey: ['media', 'bulkDelete'],
            mutationFn: async (ids: string[]) => {
                const deletedIds: string[] = [];
                for (const id of ids) {
                    try {
                        await media.delete({ id });
                        deletedIds.push(id);
                    } catch {
                        // Keep going: the remaining ids are still deletable.
                    }
                }
                return { deletedIds, total: ids.length };
            },
            meta: { invalidates, errorMessage: 'media.deleteFailed' },
        }),
        /** Upload in order; the caller reports how many went. */
        upload: mutationOptions({
            mutationKey: ['media', 'upload'],
            mutationFn: async (files: File[]) => {
                const uploaded = [];
                for (const file of files) uploaded.push(await media.upload({ file }));
                return uploaded;
            },
            meta: { invalidates, errorMessage: 'media.uploadFailed' },
        }),
        restoreVersion: mutationOptions({
            mutationKey: ['media', 'restoreVersion'],
            mutationFn: ({
                id,
                locale,
                versionId,
            }: {
                id: string;
                locale: string;
                versionId: string;
            }) => media.restoreVersion({ id, locale, versionId }),
            meta: {
                invalidates,
                successMessage: 'versions.restored',
                errorMessage: 'versions.restoreFailed',
            },
        }),
    };
}

/** Bulk delete with a toast that says how many of the selection went. */
export function useBulkDeleteMedia(options?: {
    onSuccess?: (deletedIds: string[]) => void;
}): UseMutationResult<{ deletedIds: string[]; total: number }, Error, string[]> {
    const { toast } = useToast();
    const { t } = useTranslation();
    return useAdminMutation(mediaMutations().bulkDelete, {
        onSuccess: ({ deletedIds, total }) => {
            toast(
                deletedIds.length === total
                    ? {
                          message: t('media.deletedToast', { count: total }),
                          variant: 'success',
                      }
                    : {
                          message: t('media.deletedPartialToast', {
                              deleted: deletedIds.length,
                              total,
                          }),
                          variant: 'warning',
                      }
            );
            options?.onSuccess?.(deletedIds);
        },
    });
}
