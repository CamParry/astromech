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
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { astromechUntypedClient } from 'astromech/fetch';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useConfirm } from '../components/ui/confirm';
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
 * `TAddress` is the row's address, which every write takes.
 */
export type EditResource<TRecord extends EditRecord, TAddress> = {
    namespace: string;
    capabilities: { statuses: boolean; staging: boolean; versioning: boolean };
    can: (action: 'update' | 'publish') => boolean;
    form: { hasSlug: boolean; hasStatuses: boolean; main: Field[]; sidebar: Field[] };
    canonical: EditQuery<TRecord | null>;
    /** The staged change, flagged `diverged` when the canonical moved on after it. */
    staged: EditQuery<(TRecord & { diverged: boolean }) | null>;
    versions: EditQuery<unknown[]>;
    toFormValues: (record: TRecord | null) => Partial<EntryFormValues>;
    address: TAddress;
    /** The one write: fields, and on a canonical row the status and publish gate. */
    update: UseMutationOptions<
        TRecord,
        Error,
        TAddress & { staged: boolean; data: EntryPayload }
    >;
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
        toFormValues: (entry) => ({
            title: entry?.title ?? '',
            slug: entry?.slug ?? '',
            status: entry?.status ?? 'unpublished',
            publishedAt: formatDatetimeForInput(entry?.publishedAt),
            fields: entry?.fields ?? {},
        }),
        address: { id, locale },
        update: mutations.update,
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

/** One locale of one global, for `useEditController`; `label` is what the toasts call it. */
export function globalEditResource(
    global: UseAdminGlobalResult,
    locale: string,
    label: string
): EditResource<Global, { locale: string }> {
    const { key, config, basePath, namespace, can } = global;
    const mutations = globalMutations(key, label);
    const globals = astromechUntypedClient.globals;
    return {
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
        toFormValues: (row) => ({
            status: row?.status ?? 'unpublished',
            publishedAt: formatDatetimeForInput(row?.publishedAt),
            fields: row?.fields ?? {},
        }),
        address: { locale },
        update: mutations.update,
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
    const confirm = useConfirm();
    const navigate = useNavigate();
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

    // The form reports a failed save, a 422 onto its fields.
    const update = useAdminMutation(resource.update, { toastError: false });

    const form = useEntryForm<TRecord>({
        fieldDefinitions,
        operation: 'update',
        namespace: resource.namespace,
        defaultValues: resource.toFormValues(record),
        hasSlug: resource.form.hasSlug,
        hasStatuses: resource.form.hasStatuses,
        readOnly: isReadOnly,
        saveFn: (data) =>
            update.mutateAsync({ ...resource.address, staged: isStaged, data }),
        publishFn: (data) =>
            update.mutateAsync({ ...resource.address, staged: isStaged, data }),
    });

    // Each write below either follows the editor's agreement to drop unsaved
    // changes or removes the row on screen, so its navigation skips the guard.
    const createStaged = useAdminMutation(resource.createStaged, {
        onSuccess: () => void navigate({ to: paths.staged, ignoreBlocker: true }),
    });
    const mergeStaged = useAdminMutation(resource.mergeStaged, {
        onSuccess: () => void navigate({ to: paths.canonical, ignoreBlocker: true }),
    });
    const deleteStaged = useAdminMutation(resource.deleteStaged, {
        onSuccess: () => void navigate({ to: paths.canonical, ignoreBlocker: true }),
    });

    /** Ask before staging, since the staged copy starts from the saved row. */
    function handleCreateStaged(): void {
        form.confirmDiscard(() => createStaged.mutate(resource.address));
    }

    /**
     * A merge takes the saved staged row, so its one confirm also says that
     * unsaved edits will be lost.
     */
    function handleMerge(): void {
        const message =
            stagedChange.data?.diverged === true
                ? t('staging.confirmMergeDivergedMessage')
                : t('staging.confirmMergeMessage');
        confirm({
            title: t('staging.confirmMergeTitle'),
            description: form.isDirty
                ? `${message} ${t('common.discardChangesMessage')}`
                : message,
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
            create: handleCreateStaged,
            isCreating: createStaged.isPending,
            handleMerge,
            isMerging: mergeStaged.isPending,
            handleDiscard,
            isDiscarding: deleteStaged.isPending,
        },
    };
}

export type EditController = ReturnType<typeof useEditController>;
