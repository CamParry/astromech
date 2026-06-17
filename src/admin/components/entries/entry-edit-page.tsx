/**
 * Shared entry edit page body.
 *
 * Parameterized by an `EntriesMount`; serves root and plugin-namespaced
 * entry types. Field layout comes from the definition layer:
 * `deriveFormDefinition(config)` splits field groups into main/sidebar/tab and
 * resolves the title/slug/status capability flags; each field input is
 * resolved from the field registry by type (Phase 4).
 *
 * Two-column layout: sticky action bar, main content fields left, metadata
 * sidebar right.
 */

import React from 'react';
import { useNavigate, Link as RouterLink } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Menu } from '@base-ui/react/menu';
import { Copy, ExternalLink, MoreHorizontal, Trash2 } from 'lucide-react';
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
    PageTitle,
    FormLayout,
    FormLayoutContent,
    Stack,
    PageContent,
} from '@/admin/components/ui/index.js';
import { DeleteEntryModal } from '@/admin/components/entries/DeleteEntryModal.js';
import { EntryFieldColumn } from '@/admin/components/entries/entry-fields-renderer.js';
import {
    EntryNamespaceProvider,
    namespaceForScope,
} from '@/admin/i18n/entry-namespace.js';
import { LocaleSwitcher } from '@/admin/components/translations/LocaleSwitcher.js';
import { PublishPanel } from '@/admin/components/entries/PublishPanel.js';
import {
    useEntryForm,
    usePermissions,
    useEntry,
    useEntryVersions,
    useTrashEntry,
    useDuplicateEntry,
} from '@/admin/hooks/index.js';
import type { EntryStatus } from '@/types/index.js';
import { resolveEntryUrl } from '@/support/entry-url.js';
import {
    deriveFormDefinition,
    resolveConfigForDerive,
} from '@/admin/definitions/derive.js';
import { resolveContentLocale } from '@/support/locale.js';
import type { EntriesMount } from './mount.js';

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
              : t('entries.draft');
    return <Badge variant={variant}>{label}</Badge>;
}

// ============================================================================
// Page
// ============================================================================

export function EntryEditPage({
    mount,
    id,
}: {
    mount: EntriesMount;
    id: string;
}): React.ReactElement {
    const { type, api, cacheScope, config: entryTypeConfig, basePath } = mount;
    const scope = { api, cacheScope };
    const { toast } = useToast();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [deleteOpen, setDeleteOpen] = React.useState(false);

    const { hasPermission } = usePermissions();
    const single = entryTypeConfig?.single ?? type;
    const plural = entryTypeConfig?.plural ?? type;
    const capabilities = entryTypeConfig?.capabilities;
    const formDef = deriveFormDefinition(resolveConfigForDerive(entryTypeConfig, type));
    const { hasTitle, hasSlug, hasStatuses, main, sidebar } = formDef;

    const isReadOnly = !hasPermission(mount.permissionFor('update'));

    const { data: entry, isLoading } = useEntry(type, id, scope);

    // Versioning
    const hasVersioning = capabilities?.versioning === true;
    const { data: versions } = useEntryVersions(type, id, hasVersioning, scope);
    const versionCount = versions?.length ?? 0;

    const trashEntry = useTrashEntry(type, {
        ...scope,
        onSuccess: () => void navigate({ to: basePath }),
    });

    const duplicateEntry = useDuplicateEntry(type, {
        ...scope,
        onSuccess: (newEntry) => void navigate({ to: `${basePath}/${newEntry.id}` }),
    });

    const { form, saveMutation, handleSave } = useEntryForm({
        defaultValues: {
            title: entry?.title ?? '',
            slug: entry?.slug ?? '',
            status: entry?.status ?? ('draft' as EntryStatus),
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
        onSuccess: () => {
            toast({
                message: t('entries.updated', { name: single }),
                variant: 'success',
            });
        },
    });

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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {!isReadOnly && form.state.isDirty && (
                            <span className="am-form-layout-dirty-indicator">
                                {t('common.unsavedChanges')}
                            </span>
                        )}
                        {hasStatuses && entry != null && (
                            <StatusBadge status={entry.status} />
                        )}
                        {entryTypeConfig?.url && entry?.status === 'published' && (
                            <a
                                href={resolveEntryUrl(entryTypeConfig.url, entry)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="am-btn am-btn-ghost am-btn-sm"
                            >
                                <ExternalLink
                                    size={14}
                                    style={{ marginRight: '0.25rem' }}
                                />
                                {t('common.view')}
                            </a>
                        )}
                        {!isReadOnly && (
                            <Button
                                variant="primary"
                                onClick={handleSave}
                                loading={saveMutation.isPending}
                            >
                                {t('common.update')}
                            </Button>
                        )}
                        {capabilities?.translatable && entry != null && (
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
                        {!isReadOnly && (
                            <Menu.Root>
                                <Menu.Trigger
                                    className="am-btn am-btn-secondary am-btn-md am-btn-icon"
                                    aria-label={t('entries.moreActions')}
                                >
                                    <MoreHorizontal size={14} />
                                </Menu.Trigger>
                                <Menu.Portal>
                                    <Menu.Positioner
                                        className="am-topbar-menu-positioner"
                                        sideOffset={6}
                                        align="end"
                                    >
                                        <Menu.Popup className="am-topbar-menu-popup">
                                            <Menu.Item
                                                className="am-topbar-menu-item"
                                                onClick={() => duplicateEntry.mutate(id)}
                                                disabled={duplicateEntry.isPending}
                                            >
                                                <span className="am-topbar-menu-item-icon">
                                                    <Copy size={14} />
                                                </span>
                                                {t('common.duplicate')}
                                            </Menu.Item>
                                            <Menu.Separator className="am-topbar-menu-separator" />
                                            <Menu.Item
                                                className="am-topbar-menu-item am-topbar-menu-item-danger"
                                                onClick={() => setDeleteOpen(true)}
                                            >
                                                <span className="am-topbar-menu-item-icon">
                                                    <Trash2 size={14} />
                                                </span>
                                                {t('common.delete')}
                                            </Menu.Item>
                                        </Menu.Popup>
                                    </Menu.Positioner>
                                </Menu.Portal>
                            </Menu.Root>
                        )}
                    </div>
                </PageHeader>

                <PageContent>
                    {isReadOnly && (
                        <div
                            className="am-banner am-banner-info"
                            style={{ marginBottom: '1rem' }}
                        >
                            {t('permissions.readOnly')}
                        </div>
                    )}
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
                                                        ? t('entries.titleRequired')
                                                        : undefined,
                                            }}
                                        >
                                            {(field) => (
                                                <div className="am-field">
                                                    <label
                                                        className="am-field-label"
                                                        htmlFor="entry-title"
                                                    >
                                                        {t('entries.titleField')}{' '}
                                                        <span className="am-field-required">
                                                            *
                                                        </span>
                                                    </label>
                                                    <Input
                                                        id="entry-title"
                                                        type="text"
                                                        value={field.state.value}
                                                        onChange={(e) =>
                                                            field.handleChange(
                                                                e.target.value
                                                            )
                                                        }
                                                        onBlur={field.handleBlur}
                                                        required
                                                    />
                                                    {field.state.meta.errors.length >
                                                        0 && (
                                                        <p className="am-field-error">
                                                            {field.state.meta.errors[0]}
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
                                {hasStatuses && (
                                    <form.Field name="status">
                                        {(statusField) => (
                                            <form.Field name="publishAt">
                                                {(publishAtField) => (
                                                    <PublishPanel
                                                        status={statusField.state.value}
                                                        publishAt={
                                                            publishAtField.state.value
                                                        }
                                                        publishedAt={entry?.publishedAt}
                                                        onStatusChange={(s) =>
                                                            statusField.handleChange(s)
                                                        }
                                                        onPublishAtChange={(v) =>
                                                            publishAtField.handleChange(v)
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
                                            <Panel title={t('entries.slugPanel')}>
                                                <div className="am-field">
                                                    <Input
                                                        id="entry-slug"
                                                        type="text"
                                                        value={field.state.value}
                                                        onChange={(e) =>
                                                            field.handleChange(
                                                                e.target.value
                                                            )
                                                        }
                                                        onBlur={field.handleBlur}
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
                                {hasVersioning && (
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
                </PageContent>
            </Page>
        </EntryNamespaceProvider>
    );
}
