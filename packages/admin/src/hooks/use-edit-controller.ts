/**
 * The edit page's state for one locale of an entry or a global, after
 * react-admin's `useEditController`: the canonical row or its staged change,
 * the form over it, and the staging actions with their confirms.
 */

import type { UseAdminEntryTypeResult } from './use-admin-entry-type';
import type { UseAdminGlobalResult } from './use-admin-global';
import type { EntryFormValues, EntryPayload } from './use-entry-form';
import type { QueryKey, UseMutationOptions } from '@tanstack/react-query';
import type { Entry, Field, Global } from 'astromech';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { astromechUntypedClient } from 'astromech/fetch';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useConfirm } from '../components/ui/confirm';
import { useToast } from '../components/ui/toast';
import { resolveForm } from '../rendering/resolve';
import { entryEditPath, entryVersionsPath } from '../utilities/entry-admin-path';
import { formatDatetimeForInput } from '../utilities/formatters';
import { globalEditPath, globalVersionsPath } from '../utilities/global-admin-path';
import { entryMutations } from './entries';
import { globalMutations } from './globals';
import { useAdminMutation } from './use-admin-mutation';
import { useEntryForm } from './use-entry-form';
import { queryKeys } from './use-query-keys';

/** The row types an edit page edits. */
type EditRecord = Entry | Global;

/** One read, keyed as its `queryOptions` in the resource module key it. */
type EditQuery<TData> = { queryKey: QueryKey; queryFn: () => Promise<TData> };

/**
 * What the edit controller needs from one locale of one entry or global: its
 * reads, its one `update`, its staging writes and the paths between its rows.
 * `TAddress` is what the staging writes take.
 */
export type EditResource<TRecord extends EditRecord, TAddress> = {
    /** What the toasts and the staging banner call it. */
    label: string;
    namespace: string;
    capabilities: { statuses: boolean; staging: boolean; versioning: boolean };
    can: (action: 'update' | 'publish') => boolean;
    form: { hasSlug: boolean; hasStatuses: boolean; main: Field[]; sidebar: Field[] };
    canonical: EditQuery<TRecord | null>;
    /** The staged change, flagged `diverged` when the canonical moved on after it. */
    staged: EditQuery<(TRecord & { diverged: boolean }) | null>;
    versions: EditQuery<unknown[]>;
    /** Every key the resource's writes make stale. */
    all: QueryKey;
    toFormValues: (record: TRecord | null) => Partial<EntryFormValues>;
    /** The one write: fields, and on a canonical row the status and publish gate. */
    update: (payload: EntryPayload, staged: boolean) => Promise<TRecord>;
    address: TAddress;
    createStaged: UseMutationOptions<TRecord | null, Error, TAddress>;
    mergeStaged: UseMutationOptions<TRecord, Error, TAddress>;
    deleteStaged: UseMutationOptions<void, Error, TAddress>;
    paths: { canonical: string; staged: string; versions: string };
};

/** One locale of one entry, for `useEditController`. */
export function entryEditResource(
    entryType: UseAdminEntryTypeResult,
    id: string,
    locale: string
): EditResource<Entry, { id: string; locale: string }> {
    const { type, config, basePath, namespace, can } = entryType;
    const { hasSlug, hasStatuses, main, sidebar } = resolveForm(config);
    const mutations = entryMutations(type, config.single);
    const entries = astromechUntypedClient.entries;
    return {
        label: config.single,
        namespace,
        capabilities: config.capabilities,
        can,
        form: { hasSlug, hasStatuses, main, sidebar },
        canonical: {
            queryKey: queryKeys.entries.get(type, id, locale),
            queryFn: () => entries.get({ type, id, locale }),
        },
        staged: {
            queryKey: queryKeys.entries.staged(type, id, locale),
            queryFn: () => entries.getStaged({ type, id, locale }),
        },
        versions: {
            queryKey: queryKeys.entries.versions(type, id, locale),
            queryFn: () => entries.versions({ type, id, locale }),
        },
        all: queryKeys.entries.all(type),
        toFormValues: (entry) => ({
            title: entry?.title ?? '',
            slug: entry?.slug ?? '',
            status: entry?.status ?? 'unpublished',
            publishedAt: formatDatetimeForInput(entry?.publishedAt),
            fields: entry?.fields ?? {},
        }),
        update: (data, staged) => entries.update({ type, id, locale, staged, data }),
        address: { id, locale },
        createStaged: mutations.createStaged,
        mergeStaged: mutations.mergeStaged,
        deleteStaged: mutations.deleteStaged,
        paths: {
            canonical: entryEditPath(basePath, id, { locale }),
            staged: entryEditPath(basePath, id, { locale, staged: true }),
            versions: entryVersionsPath(basePath, id, locale),
        },
    };
}

/** One locale of one global, for `useEditController`. */
export function globalEditResource(
    global: UseAdminGlobalResult,
    locale: string,
    label: string
): EditResource<Global, { locale: string }> {
    const { key, config, basePath, namespace, can } = global;
    const mutations = globalMutations(key);
    const globals = astromechUntypedClient.globals;
    return {
        label,
        namespace,
        capabilities: config.capabilities,
        can,
        form: {
            hasSlug: false,
            hasStatuses: config.capabilities.statuses,
            main: config.fields.main,
            sidebar: config.fields.sidebar,
        },
        canonical: {
            queryKey: queryKeys.globals.get(key, locale),
            // `full` is the admin read: the whole row whatever its status.
            queryFn: () => globals.get({ key, locale, full: true }),
        },
        staged: {
            queryKey: queryKeys.globals.staged(key, locale),
            queryFn: () => globals.getStaged({ key, locale }),
        },
        versions: {
            queryKey: queryKeys.globals.versions(key, locale),
            queryFn: () => globals.versions({ key, locale }),
        },
        all: queryKeys.globals.all(key),
        toFormValues: (row) => ({
            status: row?.status ?? 'unpublished',
            publishedAt: formatDatetimeForInput(row?.publishedAt),
            fields: row?.fields ?? {},
        }),
        // A staged row carries no status of its own: it takes the canonical's
        // when it is merged.
        update: ({ fields, status, publishedAt }, staged) =>
            globals.update({
                key,
                locale,
                staged,
                data: staged
                    ? { fields }
                    : {
                          fields,
                          ...(status !== undefined ? { status } : {}),
                          ...(publishedAt !== undefined ? { publishedAt } : {}),
                      },
            }),
        address: { locale },
        createStaged: mutations.createStaged,
        mergeStaged: mutations.mergeStaged,
        deleteStaged: mutations.deleteStaged,
        paths: {
            canonical: globalEditPath(basePath, { locale }),
            staged: globalEditPath(basePath, { locale, staged: true }),
            versions: globalVersionsPath(basePath, locale),
        },
    };
}

export function useEditController<TRecord extends EditRecord, TAddress>(
    resource: EditResource<TRecord, TAddress>,
    { staged: isStaged }: { staged: boolean }
) {
    const { t } = useTranslation();
    const { toast } = useToast();
    const confirm = useConfirm();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { capabilities, paths } = resource;
    const hasStaging = capabilities.staging;
    const hasVersioning = capabilities.versioning;
    const isReadOnly = !resource.can('update');

    const canonical = useQuery(resource.canonical);
    // The staged change for this locale: what the staged view edits, and what
    // tells the canonical view whether to offer "Stage" or "View staged".
    const stagedChange = useQuery({ ...resource.staged, enabled: hasStaging });
    const record = (isStaged ? stagedChange.data : canonical.data) ?? null;
    const isLoading = canonical.isLoading || (isStaged && stagedChange.isLoading);

    // A staged row lists no versions, and after a merge it is gone, so it
    // never asks.
    const versions = useQuery({
        ...resource.versions,
        enabled: hasVersioning && !isStaged,
    });

    const { main, sidebar } = resource.form;
    const fieldDefinitions = React.useMemo(() => [...main, ...sidebar], [main, sidebar]);

    const form = useEntryForm<TRecord>({
        fieldDefinitions,
        operation: 'update',
        namespace: resource.namespace,
        defaultValues: resource.toFormValues(record),
        hasSlug: resource.form.hasSlug,
        hasStatuses: resource.form.hasStatuses,
        readOnly: isReadOnly,
        saveFn: (payload) => resource.update(payload, isStaged),
        publishFn: (payload) => resource.update(payload, isStaged),
        onSuccess: (saved) => {
            // Seed the row before invalidating, so the re-render `form.reset`
            // triggers sees the saved values, not the stale cached row.
            const query = isStaged ? resource.staged : resource.canonical;
            queryClient.setQueryData(query.queryKey, saved);
            void queryClient.invalidateQueries({ queryKey: resource.all });
            toast({
                message: t('entries.updated', { name: resource.label }),
                variant: 'success',
            });
        },
    });

    const createStaged = useAdminMutation(resource.createStaged, {
        onSuccess: () => void navigate({ to: paths.staged }),
    });
    const mergeStaged = useAdminMutation(resource.mergeStaged, {
        onSuccess: () => void navigate({ to: paths.canonical }),
    });
    const deleteStaged = useAdminMutation(resource.deleteStaged, {
        onSuccess: () => void navigate({ to: paths.canonical }),
    });

    function handleMerge(): void {
        confirm({
            title: t('staging.confirmMergeTitle'),
            description:
                stagedChange.data?.diverged === true
                    ? t('staging.confirmMergeDivergedMessage')
                    : t('staging.confirmMergeMessage'),
            variant: 'primary',
            confirmLabel: t('staging.merge'),
            onConfirm: () => mergeStaged.mutate(resource.address),
        });
    }

    function handleDiscard(): void {
        confirm({
            title: t('staging.confirmDiscardTitle'),
            description: t('staging.confirmDiscardMessage'),
            variant: 'danger',
            confirmLabel: t('staging.discard'),
            onConfirm: () => deleteStaged.mutate(resource.address),
        });
    }

    return {
        record,
        canonical: canonical.data ?? null,
        isLoading,
        isStaged,
        isReadOnly,
        canPublish: resource.can('publish'),
        versionCount: versions.data?.length ?? 0,
        paths,
        ...form,
        staging: {
            enabled: hasStaging,
            stagedChange: stagedChange.data ?? null,
            create: () => createStaged.mutate(resource.address),
            isCreating: createStaged.isPending,
            handleMerge,
            isMerging: mergeStaged.isPending,
            handleDiscard,
            isDiscarding: deleteStaged.isPending,
        },
    };
}

export type EditController = ReturnType<typeof useEditController>;
