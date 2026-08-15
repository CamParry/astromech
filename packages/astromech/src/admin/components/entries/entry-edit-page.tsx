/**
 * Shared entry edit page body.
 *
 * Parameterized by an `EntriesMount`; serves root and plugin-namespaced
 * entry types. Field layout comes from the rendering layer:
 * `resolveForm(config)` splits field groups into main/sidebar/tab and
 * resolves the title/slug/status capability flags; each field input is
 * resolved from the field registry by type (Phase 4).
 *
 * Two-column layout: sticky action bar, main content fields left, metadata
 * sidebar right.
 */

import React from 'react';
import { useNavigate, Link as RouterLink } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-form';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Menu } from '@base-ui/react/menu';
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
import adminConfig from 'virtual:astromech/admin-config';
import {
    Button,
    Badge,
    Panel,
    Breadcrumb,
    Input,
    PageLoading,
    useToast,
    Page,
    PageHeader,
    PageHeaderActions,
    PageTitle,
    Tooltip,
    FormLayout,
    FormLayoutContent,
    Stack,
    PageContent,
    useConfirm,
} from '@/admin/components/ui/index';
import { DeleteEntryModal } from '@/admin/components/entries/DeleteEntryModal';
import { entryLabel } from '@/admin/components/entries/entry-label';
import { EntryFieldColumn } from '@/admin/components/entries/entry-fields-renderer';
import {
    FieldErrorsProvider,
    FieldWarningsProvider,
} from '@/admin/components/fields/field-errors-context';
import { EntryFormErrors } from './entry-form-errors';
import { FieldValidationProvider } from '@/admin/components/fields/field-validation-context';
import { EntryNamespaceProvider, namespaceForScope } from '@/admin/i18n/entry-namespace';
import { LocaleSwitcher } from '@/admin/components/translations/LocaleSwitcher';
import { PublishPanel } from '@/admin/components/entries/PublishPanel';
import {
    useEntryForm,
    usePermissions,
    useEntry,
    useEntryVersions,
    useTrashEntry,
    useDuplicateEntry,
    useGetStaged,
    useCreateStaged,
    useMergeStaged,
    useDeleteStaged,
    useIssuePreviewToken,
    useRevokePreviewToken,
} from '@/admin/hooks/index';
import { scopedEntryKeys } from '@/admin/hooks/use-query-keys';
import type { EntryStatus } from '@/types/index';
import { resolveEntryUrl } from '@/entries/utils/url.shared';
import { resolveAdminEntryType, resolveForm } from '@/admin/rendering/resolve';
import { resolveContentLocale } from '@/utilities/locale';
import { useAIContext } from '@/admin/context/ai-context';
import type { EntriesMount } from './mount';

// Surface link bases are runtime strings; address `Link` by string `to`.
type LinkProps = Omit<React.ComponentProps<typeof RouterLink>, 'to'> & { to: string };
const Link = RouterLink as unknown as (props: LinkProps) => React.ReactElement;

// ============================================================================
// Status badge
// ============================================================================

type StatusBadgeProps = { status: EntryStatus };

function StatusBadge({ status }: StatusBadgeProps): React.ReactElement {
    const { t } = useTranslation();
    const variant =
        status === 'published'
            ? 'success'
            : status === 'scheduled'
              ? 'warning'
              : 'neutral';
    const label =
        status === 'published'
            ? t('entries.published')
            : status === 'scheduled'
              ? t('entries.scheduled')
              : t('entries.unpublished');
    return <Badge variant={variant}>{label}</Badge>;
}

// ============================================================================
// Page
// ============================================================================

/**
 * Keyed by entry id.
 *
 * `LocaleSwitcher`, staging and duplicate all navigate to a DIFFERENT id on the
 * SAME route, so the route component is never remounted. Without the key the
 * body keeps one `FormApi` — and TanStack Form only copies changed
 * `defaultValues` in while the form is untouched, so after any edit the
 * previous row's values stay on screen and a save writes them to the new id.
 * A `form.reset` alone would not fix it either: the stateful field containers
 * (repeater, key-value editor, blocks, tree) seed their local state once and
 * never resync, so remount is the only reset that reaches them.
 */
export function EntryEditPage({
    mount,
    id,
}: {
    mount: EntriesMount;
    id: string;
}): React.ReactElement {
    return <EntryEditPageBody key={id} mount={mount} id={id} />;
}

function EntryEditPageBody({
    mount,
    id,
}: {
    mount: EntriesMount;
    id: string;
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

    const { data: entry, isLoading } = useEntry(type, id, scope);

    // Declare the entry in view; `null` until it loads, so no placeholder label
    // is ever published. Serves the root and plugin routes alike.
    useAIContext(
        entry != null
            ? { kind: 'entries', type, id, label: entryLabel(entry, entryType) }
            : null,
        { depth: 1 }
    );

    // Versioning. Staged rows don't surface version history (their action set is
    // Save/Merge/Discard/Preview) — skip the fetch so a post-merge stale refetch
    // can't hit the just-deleted staged row.
    const hasVersioning = capabilities?.versioning === true;
    const entryIsStaged = entry?.stagedFor != null;
    const { data: versions } = useEntryVersions(
        type,
        id,
        hasVersioning && !entryIsStaged,
        scope
    );
    const versionCount = versions?.length ?? 0;

    const trashEntry = useTrashEntry(type, {
        ...scope,
        onSuccess: () => void navigate({ to: basePath }),
    });

    const duplicateEntry = useDuplicateEntry(type, {
        ...scope,
        onSuccess: (newEntry) => void navigate({ to: `${basePath}/${newEntry.id}` }),
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
            publishAt:
                entry?.publishedAt != null
                    ? new Date(entry.publishedAt).toISOString().slice(0, 16)
                    : '',
            fields: (entry?.fields as Record<string, unknown>) ?? {},
        },
        hasSlug,
        hasStatuses,
        readOnly: isReadOnly,
        saveFn: (data) => api.update({ type, id, data }),
        publishFn: (data) => api.update({ type, id, data }),
        onSuccess: (updated) => {
            const keys = scopedEntryKeys(cacheScope);
            // Seed the cache with the saved entry before invalidating, so the
            // re-render `form.reset` triggers already sees fresh defaultValues
            // instead of the stale one the invalidated query hasn't refetched yet.
            queryClient.setQueryData(keys.get(type, id), updated);
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

    // ── Forward versioning (staged entries) ─────────────────────────────────
    const confirm = useConfirm();
    const hasStaging = capabilities?.staging === true;
    const canPublish = hasPermission(mount.permissionFor('publish'));
    // A staged entry links to its canonical via `stagedFor`; a canonical's is null.
    const isStaged = entry?.stagedFor != null;
    const canonicalId = entry?.stagedFor ?? null;
    // Merge/discard/preview-token all key off the CANONICAL id.
    const stagingTargetId = canonicalId ?? id;

    // Canonical-only: does a staged change already exist? Drives Stage vs View.
    const { data: stagedChange } = useGetStaged(
        type,
        id,
        hasStaging && !isStaged && entry != null,
        scope
    );
    // Staged-editor: load the canonical for the banner title + clobber check.
    // (When not staged this resolves to the already-cached self.)
    const { data: canonicalEntry } = useEntry(type, stagingTargetId, scope);

    const createStaged = useCreateStaged(type, {
        ...scope,
        onSuccess: (st) => void navigate({ to: `${basePath}/${st.id}` }),
        onConflict: (stagedId) => void navigate({ to: `${basePath}/${stagedId}` }),
    });
    const mergeStaged = useMergeStaged(type, stagingTargetId, {
        ...scope,
        onSuccess: () => void navigate({ to: `${basePath}/${stagingTargetId}` }),
    });
    const deleteStaged = useDeleteStaged(type, stagingTargetId, {
        ...scope,
        onSuccess: () => void navigate({ to: `${basePath}/${stagingTargetId}` }),
    });
    const issueToken = useIssuePreviewToken(type, stagingTargetId, scope);
    const revokeToken = useRevokePreviewToken(type, stagingTargetId, scope);

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
                    onConfirm={(opts) =>
                        trashEntry.mutate(
                            opts.cascadeLocales ? { id, cascadeLocales: true } : id
                        )
                    }
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
                                currentEntryId={id}
                                type={type}
                                locales={entry.locales}
                                allLocales={adminConfig.locales}
                                defaultLocale={
                                    resolveContentLocale(
                                        adminConfig.defaultLocale,
                                        adminConfig.locales
                                    ) ?? adminConfig.defaultLocale
                                }
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
                                    to={`${basePath}/${stagedChange.id}`}
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
                            {canonicalId != null && (
                                <Link
                                    to={`${basePath}/${canonicalId}`}
                                    className="am-link am-text-sm"
                                >
                                    <ArrowLeft
                                        size={14}
                                        style={{ marginRight: '0.25rem' }}
                                    />
                                    {t('staging.backToCurrent')}
                                </Link>
                            )}
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
                                                        <form.Field name="publishAt">
                                                            {(publishAtField) => (
                                                                <PublishPanel
                                                                    status={
                                                                        statusField.state
                                                                            .value
                                                                    }
                                                                    publishAt={
                                                                        publishAtField
                                                                            .state.value
                                                                    }
                                                                    publishedAt={
                                                                        entry?.publishedAt
                                                                    }
                                                                    onStatusChange={(s) =>
                                                                        statusField.handleChange(
                                                                            s
                                                                        )
                                                                    }
                                                                    onPublishAtChange={(
                                                                        v
                                                                    ) =>
                                                                        publishAtField.handleChange(
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
                                                            to={`${basePath}/${id}/versions`}
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
