/**
 * Global edit page for one global id, the site's or a plugin's. Composed from the entry edit page's own building
 * blocks (`useEntryForm`, `EntryFieldColumn`, `PublishPanel`, `LocaleSwitcher`,
 * `EntryFormErrors`) rather than a copy of it. A global has no list to return
 * to, nothing to duplicate and nothing to delete, so the header carries the
 * status, the locale, the staging controls and Update, and nothing else.
 */

import type { UseAdminGlobalResult } from '../../hooks/use-admin-global';
import type { EntryPayload } from '../../hooks/use-entry-form';
import type { Global } from 'astromech';
import { useStore } from '@tanstack/react-form';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { astromechUntypedClient } from 'astromech/fetch';
import { ArrowLeft, GitMerge, Layers, Trash2 } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { useAiContext } from '../../context/ai-context';
import {
    globalMutations,
    useGetStagedGlobal,
    useGlobal,
    useGlobalVersions,
} from '../../hooks/globals';
import { useAdminGlobal } from '../../hooks/use-admin-global';
import { useAdminMutation } from '../../hooks/use-admin-mutation';
import { useEntryForm } from '../../hooks/use-entry-form';
import { queryKeys } from '../../hooks/use-query-keys';
import { EntryNamespaceProvider } from '../../i18n/entry-namespace';
import { resolveLabel } from '../../i18n/labels';
import { Link } from '../../rendering/cells/link';
import { defaultContentLocale } from '../../utilities/content-locale';
import { formatDatetimeForInput } from '../../utilities/formatters';
import {
    globalBasePath,
    globalEditPath,
    globalVersionsPath,
} from '../../utilities/global-admin-path';
import { EntryFieldColumn } from '../entries/entry-fields-renderer';
import { EntryFormErrors } from '../entries/entry-form-errors';
import { PublishPanel } from '../entries/publish-panel';
import {
    FieldErrorsProvider,
    FieldWarningsProvider,
} from '../fields/field-errors-context';
import { FieldValidationProvider } from '../fields/field-validation-context';
import { NotFoundPage } from '../layout/not-found-page';
import { LocaleSwitcher } from '../translations/locale-switcher';
import { Breadcrumb } from '../ui/breadcrumb';
import { Button } from '../ui/button';
import { useConfirm } from '../ui/confirm';
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
} from '../ui/page';
import { Panel } from '../ui/panel';
import { StatusBadge } from '../ui/status-badge';
import { useToast } from '../ui/toast';

type GlobalEditPageProps = {
    /** Global id: `site`, or `seo/settings` for a plugin's. */
    globalKey: string;
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
    globalKey,
    locale,
    staged = false,
}: GlobalEditPageProps): React.ReactElement {
    const global = useAdminGlobal(globalKey);
    const resolvedLocale = locale ?? defaultContentLocale();
    if (global === null) return <NotFoundPage path={globalBasePath(globalKey)} />;
    return (
        <GlobalEditPageBody
            key={`${globalKey}:${resolvedLocale}:${String(staged)}`}
            global={global}
            locale={resolvedLocale}
            staged={staged}
        />
    );
}

function GlobalEditPageBody({
    global: resource,
    locale,
    staged: isStaged,
}: {
    global: UseAdminGlobalResult;
    locale: string;
    staged: boolean;
}): React.ReactElement {
    const { key, config, basePath, namespace, can } = resource;
    const { toast } = useToast();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const confirm = useConfirm();

    const label = resolveLabel(config.label, key, t, namespace);
    const capabilities = config.capabilities;
    const hasStatuses = capabilities?.statuses === true;
    const hasVersioning = capabilities?.versioning === true;
    const hasStaging = capabilities?.staging === true;
    const isTranslatable = capabilities?.translatable === true;

    const main = config.fields.main ?? [];
    const sidebar = config.fields.sidebar ?? [];
    // The two columns together ARE the full field tree the client validates.
    const fieldDefinitions = React.useMemo(() => [...main, ...sidebar], [main, sidebar]);

    const isReadOnly = !can('update');
    const canPublish = can('publish');

    // `null` is a declared global nobody has saved yet: an empty form, whose
    // first save is the `update` that creates the row.
    const { data: canonical, isLoading: canonicalLoading } = useGlobal(key, locale);
    const { data: stagedChange, isLoading: stagedLoading } = useGetStagedGlobal(
        key,
        locale,
        hasStaging
    );
    const global = (isStaged ? stagedChange : canonical) ?? null;
    const isLoading = isStaged ? canonicalLoading || stagedLoading : canonicalLoading;

    // A global's label comes from the config, so it is known before the row is.
    useAiContext({ kind: 'globals', id: key, label }, { depth: 1 });

    const { data: versions } = useGlobalVersions(key, locale, hasVersioning && !isStaged);
    const versionCount = versions?.length ?? 0;

    const canonicalPath = globalEditPath(basePath, { locale });
    const stagedPath = globalEditPath(basePath, { locale, staged: true });

    /**
     * One `update` carries the fields and, on a canonical write, the status and
     * publish gate the form asked for. A staged row carries no status of its
     * own: it takes the canonical's when it is merged.
     */
    function writeGlobal(payload: EntryPayload): Promise<Global> {
        const { fields, status, publishedAt } = payload;
        return astromechUntypedClient.globals.update({
            key,
            locale,
            staged: isStaged,
            data: isStaged
                ? { fields }
                : {
                      fields,
                      ...(status !== undefined ? { status } : {}),
                      ...(publishedAt !== undefined ? { publishedAt } : {}),
                  },
        });
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
            status: global?.status ?? 'unpublished',
            publishedAt: formatDatetimeForInput(global?.publishedAt),
            fields: (global?.fields as Record<string, unknown>) ?? {},
        },
        hasSlug: false,
        hasStatuses,
        readOnly: isReadOnly,
        saveFn: writeGlobal,
        publishFn: (payload) => writeGlobal({ ...payload, status: 'published' }),
        onSuccess: (updated) => {
            const keys = queryKeys.globals;
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

    const mutations = globalMutations(key);
    const createStaged = useAdminMutation(mutations.createStaged, {
        onSuccess: () => void navigate({ to: stagedPath }),
    });
    const mergeStaged = useAdminMutation(mutations.mergeStaged, {
        onSuccess: () => void navigate({ to: canonicalPath }),
    });
    const deleteStaged = useAdminMutation(mutations.deleteStaged, {
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
            onConfirm: () => mergeStaged.mutate({ locale }),
        });
    }

    function handleDiscard(): void {
        confirm({
            title: t('staging.confirmDiscardTitle'),
            description: t('staging.confirmDiscardMessage'),
            variant: 'danger',
            confirmLabel: t('staging.discard'),
            onConfirm: () => deleteStaged.mutate({ locale }),
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
                                    onClick={() => createStaged.mutate({ locale })}
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
