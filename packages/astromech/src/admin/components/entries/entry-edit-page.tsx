/**
 * Shared entry edit page body, parameterized by an `EntriesMount`; serves
 * root and plugin-namespaced entry types. Two-column layout: sticky action
 * bar, main content fields left, metadata sidebar right.
 */

import type { EntriesMount } from './mount';
import type { Entry, EntryStatus } from '@/types/index';
import { Menu } from '@base-ui/react/menu';
import { useStore } from '@tanstack/react-form';
import { useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink, useNavigate } from '@tanstack/react-router';
import {
    ArrowLeft,
    Copy,
    ExternalLink,
    Eye,
    GitMerge,
    Layers,
    MoreHorizontal,
    Trash2,
} from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { DeleteEntryModal } from '@/admin/components/entries/delete-entry-modal';
import { EntryFieldColumn } from '@/admin/components/entries/entry-fields-renderer';
import { entryLabel } from '@/admin/components/entries/entry-label';
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
import { Input } from '@/admin/components/ui/input';
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
import { Tooltip } from '@/admin/components/ui/tooltip';
import { useAiContext } from '@/admin/context/ai-context';
import { authorName, useAuthorNames } from '@/admin/hooks/author-names';
import {
    useCreateStaged,
    useDeleteStaged,
    useDuplicateEntry,
    useEntry,
    useEntryVersions,
    useGetStaged,
    useIssuePreviewToken,
    useMergeStaged,
    useRevokePreviewToken,
    useTrashEntry,
} from '@/admin/hooks/entries';
import { useEntryForm } from '@/admin/hooks/use-entry-form';
import { usePermissions } from '@/admin/hooks/use-permissions';
import { scopedEntryKeys } from '@/admin/hooks/use-query-keys';
import { EntryNamespaceProvider, namespaceForScope } from '@/admin/i18n/entry-namespace';
import { resolveAdminEntryType, resolveForm } from '@/admin/rendering/resolve';
import { defaultContentLocale } from '@/admin/utilities/content-locale';
import { entryEditPath, entryVersionsPath } from '@/admin/utilities/entry-admin-path';
import { resolveEntryUrl } from '@/entries/entry-url.shared';
import { formatDatetime } from '@/utilities/dates';
import { EntryFormErrors } from './entry-form-errors';

// Surface link bases are runtime strings; address `Link` by string `to`.
type LinkProps = Omit<React.ComponentProps<typeof RouterLink>, 'to'> & { to: string };
const Link = RouterLink as unknown as (props: LinkProps) => React.ReactElement;

/**
 * Keyed by the row in view: duplicate navigates to a different id, and the
 * locale switcher and staging to a different row of the same id, all on the
 * same route. Without the key TanStack Form and the stateful field containers
 * (repeater, blocks, tree) would keep the last row's state.
 */
export function EntryEditPage({
    mount,
    id,
    locale,
    staged = false,
}: EntryEditPageProps): React.ReactElement {
    const resolvedLocale = locale ?? defaultContentLocale();
    return (
        <EntryEditPageBody
            key={`${id}:${resolvedLocale}:${String(staged)}`}
            mount={mount}
            id={id}
            locale={resolvedLocale}
            staged={staged}
        />
    );
}

type EntryEditPageProps = {
    mount: EntriesMount;
    id: string;
    /** Locale from the route search params; defaults to the default content locale. */
    locale: string | undefined;
    /** Edit the staged change for that locale rather than the canonical row. */
    staged?: boolean | undefined;
};

function EntryEditPageBody({
    mount,
    id,
    locale,
    staged: isStaged,
}: {
    mount: EntriesMount;
    id: string;
    locale: string;
    staged: boolean;
}): React.ReactElement {
    const { type, api, cacheScope, config: entryType, basePath } = mount;
    const scope = { api, cacheScope };
    const { toast } = useToast();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [deleteOpen, setDeleteOpen] = React.useState(false);

    const { hasPermission } = usePermissions();
    const single = entryType?.single ?? type;
    const plural = entryType?.plural ?? type;
    const capabilities = entryType?.capabilities;
    const resolvedForm = resolveForm(resolveAdminEntryType(entryType, type));
    const { hasTitle, hasSlug, hasStatuses, main, sidebar } = resolvedForm;
    // The two columns together ARE the full field tree the client validates.
    const fieldDefinitions = React.useMemo(() => [...main, ...sidebar], [main, sidebar]);

    const isReadOnly = !hasPermission(mount.permissionFor('update'));

    const hasStaging = entryType?.capabilities?.staging === true;
    const { data: canonicalEntry, isLoading: canonicalLoading } = useEntry(
        type,
        id,
        locale,
        scope
    );
    // The staged change for this locale: what the staged editor shows, and what
    // tells the canonical view whether to offer "Stage" or "View staged".
    const { data: stagedChange, isLoading: stagedLoading } = useGetStaged(
        type,
        id,
        locale,
        hasStaging,
        scope
    );
    const entry = isStaged ? (stagedChange ?? undefined) : canonicalEntry;
    const authorNames = useAuthorNames();
    const isLoading = isStaged ? canonicalLoading || stagedLoading : canonicalLoading;

    // Declare the entry in view; `null` until it loads, so no placeholder label
    // is ever published. Serves the root and plugin routes alike.
    useAiContext(
        entry != null
            ? { kind: 'entries', type, id, label: entryLabel(entry, entryType) }
            : null,
        { depth: 1 }
    );

    // Versioning. Staged rows don't surface version history (their action set is
    // Save/Merge/Discard/Preview) — skip the fetch so a post-merge stale refetch
    // can't hit the just-deleted staged row.
    const hasVersioning = capabilities?.versioning === true;
    const { data: versions } = useEntryVersions(
        type,
        id,
        locale,
        hasVersioning && !isStaged,
        scope
    );
    const versionCount = versions?.length ?? 0;

    const trashEntry = useTrashEntry(type, {
        ...scope,
        onSuccess: () => void navigate({ to: basePath }),
    });

    const duplicateEntry = useDuplicateEntry(type, {
        ...scope,
        onSuccess: (newEntry) =>
            void navigate({
                to: entryEditPath(basePath, newEntry.id, { locale: newEntry.locale }),
            }),
    });

    const {
        form,
        saveMutation,
        handleSave,
        fieldErrors,
        fieldWarnings,
        formErrors,
        fieldValidation,
    } = useEntryForm({
        fieldDefinitions,
        operation: 'update',
        namespace: namespaceForScope(cacheScope),
        defaultValues: {
            title: entry?.title ?? '',
            slug: entry?.slug ?? '',
            status: entry?.status ?? ('unpublished' as EntryStatus),
            publishedAt:
                entry?.publishedAt != null
                    ? new Date(entry.publishedAt).toISOString().slice(0, 16)
                    : '',
            fields: (entry?.fields as Record<string, unknown>) ?? {},
        },
        hasSlug,
        hasStatuses,
        readOnly: isReadOnly,
        saveFn: (data) => api.update({ type, id, locale, staged: isStaged, data }),
        publishFn: (data) => api.update({ type, id, locale, staged: isStaged, data }),
        onSuccess: (updated) => {
            const keys = scopedEntryKeys(cacheScope);
            // Seed the cache with the saved entry before invalidating, so the
            // re-render `form.reset` triggers already sees fresh defaultValues
            // instead of the stale one the invalidated query hasn't refetched yet.
            queryClient.setQueryData(
                isStaged ? keys.staged(type, id, locale) : keys.get(type, id, locale),
                updated
            );
            void queryClient.invalidateQueries({ queryKey: keys.all(type) });
            toast({
                message: t('entries.updated', { name: single }),
                variant: 'success',
            });
        },
    });

    // `form.state` is a plain getter — reading it in render never re-renders on
    // change, so the unsaved-changes indicator would miss most edits.
    const isDirty = useStore(form.store, (state) => state.isDirty);

    // Forward versioning: staged entries. A staged row shares its entry's id,
    // so every staging call is `{ id, locale }` and only the search param says
    // which row is on screen.
    const confirm = useConfirm();
    const canPublish = hasPermission(mount.permissionFor('publish'));
    const canonicalPath = entryEditPath(basePath, id, { locale });
    const stagedPath = entryEditPath(basePath, id, { locale, staged: true });

    const createStaged = useCreateStaged(type, locale, {
        ...scope,
        onSuccess: () => void navigate({ to: stagedPath }),
        onConflict: () => void navigate({ to: stagedPath }),
    });
    const mergeStaged = useMergeStaged(type, id, locale, {
        ...scope,
        onSuccess: () => void navigate({ to: canonicalPath }),
    });
    const deleteStaged = useDeleteStaged(type, id, locale, {
        ...scope,
        onSuccess: () => void navigate({ to: canonicalPath }),
    });
    const issueToken = useIssuePreviewToken(type, id, scope);
    const revokeToken = useRevokePreviewToken(type, id, scope);

    const previewUrl =
        entryType?.url && entry != null ? resolveEntryUrl(entryType.url, entry) : null;

    // One surface control, not two. A published entry links straight to its live
    // page; anything else opens a tokenised preview of the last saved state.
    const showViewLive = !isStaged && previewUrl != null && entry?.status === 'published';
    const showPreview = hasStaging && previewUrl != null && !showViewLive;
    const previewLabel = isStaged ? t('staging.previewStaged') : t('staging.preview');

    function handlePreview(staged: boolean): void {
        if (!previewUrl) return;
        issueToken.mutate(undefined, {
            onSuccess: ({ token }) => {
                const url = `${previewUrl}?preview=${encodeURIComponent(token)}${
                    staged ? '&staged=1' : ''
                }`;
                window.open(url, '_blank', 'noopener');
            },
        });
    }

    function handleMerge(): void {
        // Clobber warning: the canonical was edited after this staged change began.
        const diverged =
            canonicalEntry != null &&
            entry != null &&
            new Date(canonicalEntry.updatedAt).getTime() >
                new Date(entry.createdAt).getTime();
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
        <EntryNamespaceProvider namespace={namespaceForScope(cacheScope)}>
            <Page>
                <DeleteEntryModal
                    open={deleteOpen}
                    entry={entry ?? null}
                    typeLabel={single}
                    force={false}
                    onCancel={() => setDeleteOpen(false)}
                    onConfirm={() => trashEntry.mutate(id)}
                    loading={trashEntry.isPending}
                />
                <PageHeader>
                    <PageTitle>
                        <Breadcrumb
                            items={[
                                { label: plural, to: basePath },
                                {
                                    label: t('entries.editTitle', {
                                        title: hasTitle
                                            ? (entry?.title ?? single)
                                            : single,
                                    }),
                                },
                            ]}
                        />
                    </PageTitle>
                    <PageHeaderActions>
                        {!isReadOnly && isDirty && (
                            <span className="am-form-layout-dirty-indicator">
                                {t('common.unsavedChanges')}
                            </span>
                        )}
                        {hasStatuses && !isStaged && entry != null && (
                            <StatusBadge status={entry.status} />
                        )}
                        {!isStaged && capabilities?.translatable && entry != null && (
                            <LocaleSwitcher
                                id={id}
                                currentLocale={entry.locale}
                                type={type}
                                basePath={basePath}
                                locales={entry.locales}
                                allLocales={adminConfig.locales}
                                defaultLocale={defaultContentLocale()}
                                scope={scope}
                                compact
                            />
                        )}
                        {showViewLive && (
                            <Tooltip content={t('entries.viewLive')}>
                                <a
                                    href={previewUrl ?? undefined}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="am-btn am-btn-secondary am-btn-md am-btn-icon"
                                    aria-label={t('entries.viewLive')}
                                >
                                    <ExternalLink size={16} />
                                </a>
                            </Tooltip>
                        )}
                        {/* Preview (forward versioning): issue a token, open the front-end URL. */}
                        {showPreview && (
                            <Tooltip content={previewLabel}>
                                <Button
                                    variant="secondary"
                                    aria-label={previewLabel}
                                    onClick={() => handlePreview(isStaged)}
                                    loading={issueToken.isPending}
                                    icon={<Eye size={16} />}
                                />
                            </Tooltip>
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
                                    onClick={() => createStaged.mutate(id)}
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
                        {/* Staged: merge is the primary commit action (needs publish). */}
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
                        {!isReadOnly && (
                            <Menu.Root>
                                <Menu.Trigger
                                    className="am-btn am-btn-secondary am-btn-md am-btn-icon"
                                    aria-label={t('entries.moreActions')}
                                >
                                    <MoreHorizontal size={16} />
                                </Menu.Trigger>
                                <Menu.Portal>
                                    <Menu.Positioner
                                        className="am-topbar-menu-positioner"
                                        sideOffset={6}
                                        align="end"
                                    >
                                        <Menu.Popup className="am-topbar-menu-popup">
                                            {isStaged ? (
                                                <Menu.Item
                                                    className="am-topbar-menu-item am-topbar-menu-item-danger"
                                                    onClick={handleDiscard}
                                                    disabled={deleteStaged.isPending}
                                                >
                                                    <span className="am-topbar-menu-item-icon">
                                                        <Trash2 size={14} />
                                                    </span>
                                                    {t('staging.discard')}
                                                </Menu.Item>
                                            ) : (
                                                <>
                                                    <Menu.Item
                                                        className="am-topbar-menu-item"
                                                        onClick={() =>
                                                            duplicateEntry.mutate(id)
                                                        }
                                                        disabled={
                                                            duplicateEntry.isPending
                                                        }
                                                    >
                                                        <span className="am-topbar-menu-item-icon">
                                                            <Copy size={14} />
                                                        </span>
                                                        {t('common.duplicate')}
                                                    </Menu.Item>
                                                    {hasStaging && (
                                                        <Menu.Item
                                                            className="am-topbar-menu-item"
                                                            onClick={() =>
                                                                revokeToken.mutate()
                                                            }
                                                            disabled={
                                                                revokeToken.isPending
                                                            }
                                                        >
                                                            <span className="am-topbar-menu-item-icon">
                                                                <Eye size={14} />
                                                            </span>
                                                            {t('staging.revokePreview')}
                                                        </Menu.Item>
                                                    )}
                                                    <Menu.Separator className="am-topbar-menu-separator" />
                                                    <Menu.Item
                                                        className="am-topbar-menu-item am-topbar-menu-item-danger"
                                                        onClick={() =>
                                                            setDeleteOpen(true)
                                                        }
                                                    >
                                                        <span className="am-topbar-menu-item-icon">
                                                            <Trash2 size={14} />
                                                        </span>
                                                        {t('common.delete')}
                                                    </Menu.Item>
                                                </>
                                            )}
                                        </Menu.Popup>
                                    </Menu.Positioner>
                                </Menu.Portal>
                            </Menu.Root>
                        )}
                    </PageHeaderActions>
                </PageHeader>

                {entry != null && (
                    <p className="am-entry-meta">
                        {entryMetaLine(entry, authorNames, t)}
                    </p>
                )}

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
                            <span>
                                {t('staging.banner', {
                                    title: canonicalEntry?.title ?? single,
                                })}
                            </span>
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
                                            {hasTitle && (
                                                <Panel>
                                                    <form.Field
                                                        name="title"
                                                        validators={{
                                                            onChange: ({ value }) =>
                                                                value.trim() === ''
                                                                    ? t(
                                                                          'entries.titleRequired'
                                                                      )
                                                                    : undefined,
                                                        }}
                                                    >
                                                        {(field) => (
                                                            <div className="am-field">
                                                                <label
                                                                    className="am-field-label"
                                                                    htmlFor="entry-title"
                                                                >
                                                                    {t(
                                                                        'entries.titleField'
                                                                    )}{' '}
                                                                    <span className="am-field-required">
                                                                        *
                                                                    </span>
                                                                </label>
                                                                <Input
                                                                    id="entry-title"
                                                                    type="text"
                                                                    value={
                                                                        field.state.value
                                                                    }
                                                                    onChange={(e) =>
                                                                        field.handleChange(
                                                                            e.target.value
                                                                        )
                                                                    }
                                                                    onBlur={
                                                                        field.handleBlur
                                                                    }
                                                                    required
                                                                />
                                                                {field.state.meta.errors
                                                                    .length > 0 && (
                                                                    <p className="am-field-error">
                                                                        {
                                                                            field.state
                                                                                .meta
                                                                                .errors[0]
                                                                        }
                                                                    </p>
                                                                )}
                                                            </div>
                                                        )}
                                                    </form.Field>
                                                </Panel>
                                            )}

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
                                                                        entry?.publishedAt
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

                                            {hasSlug && (
                                                <form.Field name="slug">
                                                    {(field) => (
                                                        <Panel
                                                            title={t('entries.slugPanel')}
                                                        >
                                                            <div className="am-field">
                                                                <Input
                                                                    id="entry-slug"
                                                                    type="text"
                                                                    value={
                                                                        field.state.value
                                                                    }
                                                                    onChange={(e) =>
                                                                        field.handleChange(
                                                                            e.target.value
                                                                        )
                                                                    }
                                                                    onBlur={
                                                                        field.handleBlur
                                                                    }
                                                                    pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
                                                                />
                                                            </div>
                                                        </Panel>
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
                                                            to={entryVersionsPath(
                                                                basePath,
                                                                id,
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

/**
 * The edit page's one metadata line: when this locale was last written and by
 * whom, then when the entry was made and by whom. An author the current user
 * cannot resolve is left out rather than shown as a raw id.
 */
function entryMetaLine(
    entry: Entry,
    authorNames: Map<string, string>,
    t: ReturnType<typeof useTranslation>['t']
): string {
    const updatedName = authorName(entry.updatedBy, authorNames);
    const createdName = authorName(entry.createdBy, authorNames);
    const updated =
        updatedName !== undefined
            ? t('entries.updatedMeta', {
                  date: formatDatetime(entry.updatedAt),
                  name: updatedName,
              })
            : t('entries.updatedMetaNoAuthor', { date: formatDatetime(entry.updatedAt) });
    const created =
        createdName !== undefined
            ? t('entries.createdMeta', {
                  date: formatDatetime(entry.createdAt),
                  name: createdName,
              })
            : t('entries.createdMetaNoAuthor', { date: formatDatetime(entry.createdAt) });

    return `${updated} · ${created}`;
}
