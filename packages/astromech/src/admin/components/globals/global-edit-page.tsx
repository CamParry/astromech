/**
 * Global edit page, parameterized by a `GlobalsBinding`; serves host and
 * plugin-namespaced globals. Composed from the entry edit page's own building
 * blocks (`useEntryForm`, `EntryFieldColumn`, `PublishPanel`, `LocaleSwitcher`,
 * `EntryFormErrors`) rather than a copy of it. A global has no list to return
 * to, nothing to duplicate and nothing to delete, so the header carries the
 * status, the locale, the staging controls and Update, and nothing else.
 */

import type { GlobalsBinding } from './binding';
import type { EntryPayload } from '@/admin/hooks/use-entry-form';
import type { EntryStatus, Global } from '@/types/index';
import { useStore } from '@tanstack/react-form';
import { useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, GitMerge, Layers, Trash2 } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { EntryFieldColumn } from '@/admin/components/entries/entry-fields-renderer';
import { EntryFormErrors } from '@/admin/components/entries/entry-form-errors';
import { PublishPanel } from '@/admin/components/entries/publish-panel';
import {
    FieldErrorsProvider,
    FieldWarningsProvider,
} from '@/admin/components/fields/field-errors-context';
import { FieldValidationProvider } from '@/admin/components/fields/field-validation-context';
import { LocaleSwitcher } from '@/admin/components/translations/locale-switcher';
import { Breadcrumb } from '@/admin/components/ui/breadcrumb';
import { Button } from '@/admin/components/ui/button';
import { useConfirm } from '@/admin/components/ui/confirm';
import {
    FormLayout,
    FormLayoutContent,
    Page,
    PageContent,
    PageHeader,
    PageHeaderActions,
    PageLoading,
    PageTitle,
    Stack,
} from '@/admin/components/ui/page';
import { Panel } from '@/admin/components/ui/panel';
import { StatusBadge } from '@/admin/components/ui/status-badge';
import { useToast } from '@/admin/components/ui/toast';
import { useAiContext } from '@/admin/context/ai-context';
import {
    useCreateStagedGlobal,
    useDeleteStagedGlobal,
    useGetStagedGlobal,
    useGlobal,
    useGlobalVersions,
    useMergeStagedGlobal,
} from '@/admin/hooks/globals';
import { useEntryForm } from '@/admin/hooks/use-entry-form';
import { usePermissions } from '@/admin/hooks/use-permissions';
import { scopedGlobalKeys } from '@/admin/hooks/use-query-keys';
import { EntryNamespaceProvider, namespaceForScope } from '@/admin/i18n/entry-namespace';
import { resolveLabel } from '@/admin/i18n/labels';
import { defaultContentLocale } from '@/admin/utilities/content-locale';
import { globalEditPath, globalVersionsPath } from '@/admin/utilities/global-admin-path';

// Binding link bases are runtime strings; address `Link` by string `to`.
type LinkProps = Omit<React.ComponentProps<typeof RouterLink>, 'to'> & { to: string };
const Link = RouterLink as unknown as (props: LinkProps) => React.ReactElement;

type GlobalEditPageProps = {
    binding: GlobalsBinding;
    /** Locale from the route search params; defaults to the default content locale. */
    locale: string | undefined;
    /** Show the staged change for that locale rather than the canonical row. */
    staged?: boolean | undefined;
};

/**
 * Keyed by the row in view: the locale switcher and the staging controls both
 * swap the row under the same route. Without the key TanStack Form and the
 * stateful field containers would keep the last row's state.
 */
export function GlobalEditPage({
    binding,
    locale,
    staged = false,
}: GlobalEditPageProps): React.ReactElement {
    const resolvedLocale = locale ?? defaultContentLocale();
    return (
        <GlobalEditPageBody
            key={`${binding.key}:${resolvedLocale}:${String(staged)}`}
            binding={binding}
            locale={resolvedLocale}
            staged={staged}
        />
    );
}

function GlobalEditPageBody({
    binding,
    locale,
    staged: isStaged,
}: {
    binding: GlobalsBinding;
    locale: string;
    staged: boolean;
}): React.ReactElement {
    const { key, api, cacheScope, config, basePath } = binding;
    const scope = { api, cacheScope };
    const namespace = namespaceForScope(cacheScope);
    const { toast } = useToast();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const confirm = useConfirm();
    const { hasPermission } = usePermissions();

    const label = resolveLabel(config?.label, key, t, namespace);
    const capabilities = config?.capabilities;
    const hasStatuses = capabilities?.statuses === true;
    const hasVersioning = capabilities?.versioning === true;
    const hasStaging = capabilities?.staging === true;
    const isTranslatable = capabilities?.translatable === true;

    const main = config?.fields.main ?? [];
    const sidebar = config?.fields.sidebar ?? [];
    // The two columns together ARE the full field tree the client validates.
    const fieldDefinitions = React.useMemo(() => [...main, ...sidebar], [main, sidebar]);

    const isReadOnly = !hasPermission(binding.permissionFor('update'));
    const canPublish = hasPermission(binding.permissionFor('publish'));

    // `null` is a declared global nobody has saved yet: an empty form, whose
    // first save is the `update` that creates the row.
    const { data: canonical, isLoading: canonicalLoading } = useGlobal(
        key,
        locale,
        scope
    );
    const { data: stagedChange, isLoading: stagedLoading } = useGetStagedGlobal(
        key,
        locale,
        hasStaging,
        scope
    );
    const global = (isStaged ? stagedChange : canonical) ?? null;
    const isLoading = isStaged ? canonicalLoading || stagedLoading : canonicalLoading;

    // A global's label comes from the config, so it is known before the row is.
    useAiContext({ kind: 'globals', id: key, label }, { depth: 1 });

    const { data: versions } = useGlobalVersions(
        key,
        locale,
        hasVersioning && !isStaged,
        scope
    );
    const versionCount = versions?.length ?? 0;

    const canonicalPath = globalEditPath(basePath, { locale });
    const stagedPath = globalEditPath(basePath, { locale, staged: true });

    /**
     * `useEntryForm` builds one payload for both resources, but a global's
     * `update` takes only fields — its status moves through `publish`,
     * `unpublish` and `schedule`. So the write is the field save followed by
     * the status transition the form asked for, when it differs from the row's.
     */
    async function writeGlobal(payload: EntryPayload): Promise<Global> {
        const saved = await api.update({
            key,
            locale,
            staged: isStaged,
            data: { fields: payload.fields },
        });
        // A staged row carries no status of its own: it takes the canonical's
        // when it is merged.
        if (!hasStatuses || isStaged) return saved;
        const wanted = payload.status;
        if (wanted === undefined || wanted === saved.status) {
            // A reschedule keeps the status and moves the gate, so it is the
            // one transition a same-status write still has to make.
            if (wanted === 'scheduled' && payload.publishedAt != null) {
                return api.schedule({ key, locale, publishedAt: payload.publishedAt });
            }
            return saved;
        }
        if (wanted === 'published') return api.publish({ key, locale });
        if (wanted === 'unpublished') return api.unpublish({ key, locale });
        if (payload.publishedAt != null) {
            return api.schedule({ key, locale, publishedAt: payload.publishedAt });
        }
        return saved;
    }

    const {
        form,
        saveMutation,
        handleSave,
        fieldErrors,
        fieldWarnings,
        formErrors,
        fieldValidation,
    } = useEntryForm<Global>({
        fieldDefinitions,
        operation: 'update',
        namespace,
        defaultValues: {
            status: global?.status ?? ('unpublished' as EntryStatus),
            publishedAt:
                global?.publishedAt != null
                    ? new Date(global.publishedAt).toISOString().slice(0, 16)
                    : '',
            fields: (global?.fields as Record<string, unknown>) ?? {},
        },
        hasSlug: false,
        hasStatuses,
        readOnly: isReadOnly,
        saveFn: writeGlobal,
        publishFn: (payload) => writeGlobal({ ...payload, status: 'published' }),
        onSuccess: (updated) => {
            const keys = scopedGlobalKeys(cacheScope);
            // Seed the cache before invalidating, so the re-render `form.reset`
            // triggers sees fresh defaultValues rather than the stale row the
            // invalidated query has not refetched yet.
            queryClient.setQueryData(
                isStaged ? keys.staged(key, locale) : keys.get(key, locale),
                updated
            );
            void queryClient.invalidateQueries({ queryKey: keys.all(key) });
            toast({ message: t('globals.updated', { name: label }), variant: 'success' });
        },
    });

    // `form.state` is a plain getter — reading it in render never re-renders on
    // change, so the unsaved-changes indicator would miss most edits.
    const isDirty = useStore(form.store, (state) => state.isDirty);

    const createStaged = useCreateStagedGlobal(key, locale, {
        ...scope,
        onSuccess: () => void navigate({ to: stagedPath }),
        onConflict: () => void navigate({ to: stagedPath }),
    });
    const mergeStaged = useMergeStagedGlobal(key, locale, {
        ...scope,
        onSuccess: () => void navigate({ to: canonicalPath }),
    });
    const deleteStaged = useDeleteStagedGlobal(key, locale, {
        ...scope,
        onSuccess: () => void navigate({ to: canonicalPath }),
    });

    function handleMerge(): void {
        // Clobber warning: the canonical was edited after this staged change began.
        const diverged =
            canonical != null &&
            global != null &&
            new Date(canonical.updatedAt).getTime() >
                new Date(global.createdAt).getTime();
        confirm({
            title: t('staging.confirmMergeTitle'),
            description: diverged
                ? t('staging.confirmMergeDivergedMessage')
                : t('staging.confirmMergeMessage'),
            variant: 'primary',
            confirmLabel: t('staging.merge'),
            onConfirm: () => mergeStaged.mutate(),
        });
    }

    function handleDiscard(): void {
        confirm({
            title: t('staging.confirmDiscardTitle'),
            description: t('staging.confirmDiscardMessage'),
            variant: 'danger',
            confirmLabel: t('staging.discard'),
            onConfirm: () => deleteStaged.mutate(),
        });
    }

    if (isLoading) {
        return <PageLoading />;
    }

    return (
        <EntryNamespaceProvider namespace={namespace}>
            <Page>
                <PageHeader>
                    <PageTitle>
                        <Breadcrumb items={[{ label }]} />
                    </PageTitle>
                    <PageHeaderActions>
                        {!isReadOnly && isDirty && (
                            <span className="am-form-layout-dirty-indicator">
                                {t('common.unsavedChanges')}
                            </span>
                        )}
                        {hasStatuses && !isStaged && global != null && (
                            <StatusBadge status={global.status} />
                        )}
                        {!isStaged && isTranslatable && (
                            <LocaleSwitcher
                                id={key}
                                currentLocale={locale}
                                basePath={basePath}
                                locales={global?.locales ?? [locale]}
                                allLocales={adminConfig.locales}
                                defaultLocale={defaultContentLocale()}
                                // A locale with no row renders an empty form,
                                // and its first save writes the row — so the
                                // switch is a navigation, not a mutation.
                                onSelectMissing={(next) =>
                                    void navigate({
                                        to: globalEditPath(basePath, { locale: next }),
                                    })
                                }
                                compact
                            />
                        )}
                        {/* Canonical: stage a change, or jump to the existing one. */}
                        {hasStaging &&
                            !isStaged &&
                            !isReadOnly &&
                            (stagedChange != null ? (
                                <Link
                                    to={stagedPath}
                                    className="am-btn am-btn-secondary am-btn-md"
                                >
                                    <Layers size={16} />
                                    {t('staging.viewStaged')}
                                </Link>
                            ) : (
                                <Button
                                    variant="secondary"
                                    icon={<Layers size={16} />}
                                    onClick={() => createStaged.mutate()}
                                    loading={createStaged.isPending}
                                >
                                    {t('staging.stageChange')}
                                </Button>
                            ))}
                        {!isReadOnly && (
                            <Button
                                variant={isStaged ? 'secondary' : 'primary'}
                                onClick={handleSave}
                                loading={saveMutation.isPending}
                            >
                                {t('common.update')}
                            </Button>
                        )}
                        {/* Staged: merge is the commit action (needs publish). */}
                        {isStaged && canPublish && (
                            <Button
                                variant="primary"
                                icon={<GitMerge size={16} />}
                                onClick={handleMerge}
                                loading={mergeStaged.isPending}
                            >
                                {t('staging.merge')}
                            </Button>
                        )}
                        {isStaged && !isReadOnly && (
                            <Button
                                variant="danger"
                                icon={<Trash2 size={16} />}
                                onClick={handleDiscard}
                                loading={deleteStaged.isPending}
                            >
                                {t('staging.discard')}
                            </Button>
                        )}
                    </PageHeaderActions>
                </PageHeader>

                <PageContent>
                    {isStaged && (
                        <div
                            className="am-banner am-banner-info"
                            style={{
                                marginBottom: '1rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                            }}
                        >
                            <span>{t('staging.banner', { title: label })}</span>
                            <Link to={canonicalPath} className="am-link am-text-sm">
                                <ArrowLeft size={14} style={{ marginRight: '0.25rem' }} />
                                {t('staging.backToCurrent')}
                            </Link>
                        </div>
                    )}
                    {isReadOnly && (
                        <div
                            className="am-banner am-banner-info"
                            style={{ marginBottom: '1rem' }}
                        >
                            {t('permissions.readOnly')}
                        </div>
                    )}
                    <EntryFormErrors messages={formErrors} />
                    <FieldValidationProvider value={fieldValidation}>
                        <FieldErrorsProvider value={fieldErrors}>
                            <FieldWarningsProvider value={fieldWarnings}>
                                <FormLayout>
                                    <FormLayoutContent>
                                        <Stack gap={8}>
                                            <form.Field name="fields">
                                                {(f) => (
                                                    <EntryFieldColumn
                                                        nodes={main}
                                                        values={f.state.value}
                                                        onChange={(name, value) =>
                                                            f.handleChange({
                                                                ...f.state.value,
                                                                [name]: value,
                                                            })
                                                        }
                                                        disabled={isReadOnly}
                                                    />
                                                )}
                                            </form.Field>
                                        </Stack>

                                        <Stack gap={8}>
                                            {hasStatuses && !isStaged && (
                                                <form.Field name="status">
                                                    {(statusField) => (
                                                        <form.Field name="publishedAt">
                                                            {(publishedAtField) => (
                                                                <PublishPanel
                                                                    status={
                                                                        statusField.state
                                                                            .value
                                                                    }
                                                                    publishedAt={
                                                                        publishedAtField
                                                                            .state.value
                                                                    }
                                                                    entryPublishedAt={
                                                                        global?.publishedAt
                                                                    }
                                                                    onStatusChange={(s) =>
                                                                        statusField.handleChange(
                                                                            s
                                                                        )
                                                                    }
                                                                    onPublishedAtChange={(
                                                                        v
                                                                    ) =>
                                                                        publishedAtField.handleChange(
                                                                            v
                                                                        )
                                                                    }
                                                                    readOnly={isReadOnly}
                                                                />
                                                            )}
                                                        </form.Field>
                                                    )}
                                                </form.Field>
                                            )}

                                            <form.Field name="fields">
                                                {(f) => (
                                                    <EntryFieldColumn
                                                        nodes={sidebar}
                                                        values={f.state.value}
                                                        onChange={(name, value) =>
                                                            f.handleChange({
                                                                ...f.state.value,
                                                                [name]: value,
                                                            })
                                                        }
                                                        disabled={isReadOnly}
                                                    />
                                                )}
                                            </form.Field>

                                            {hasVersioning && !isStaged && (
                                                <Panel>
                                                    {versionCount > 0 ? (
                                                        <Link
                                                            to={globalVersionsPath(
                                                                basePath,
                                                                locale
                                                            )}
                                                            className="am-link am-text-sm"
                                                        >
                                                            {t('versions.revisionsLink', {
                                                                count: versionCount,
                                                            })}
                                                        </Link>
                                                    ) : (
                                                        <span className="am-text-sm am-text-muted">
                                                            {t('versions.noRevisionsYet')}
                                                        </span>
                                                    )}
                                                </Panel>
                                            )}
                                        </Stack>
                                    </FormLayoutContent>
                                </FormLayout>
                            </FieldWarningsProvider>
                        </FieldErrorsProvider>
                    </FieldValidationProvider>
                </PageContent>
            </Page>
        </EntryNamespaceProvider>
    );
}
