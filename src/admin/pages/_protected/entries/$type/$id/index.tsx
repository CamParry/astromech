/**
 * Entry edit page.
 *
 * Two-column layout: sticky action bar, main content fields left, metadata sidebar right.
 */

import React from 'react';
import { createFileRoute, useParams, useNavigate, Link } from '@tanstack/react-router';
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
    useConfirm,
    Page,
    PageHeader,
    PageTitle,
    FormLayout,
    FormLayoutContent,
    FormLayoutMain,
    FormLayoutSidebar,
    PageContent,
} from '@/admin/components/ui/index.js';
import { FormField } from '@/admin/components/fields/form-field.js';
import { LocaleSwitcher } from '@/admin/components/translations/LocaleSwitcher.js';
import { PublishPanel } from '@/admin/components/entries/PublishPanel.js';
import { Astromech } from '@/sdk/fetch/index.js';
import {
    useEntryForm,
    usePermissions,
    useEntry,
    useEntryVersions,
    useEntryTranslations,
    useTrashEntry,
    useDuplicateEntry,
} from '@/admin/hooks/index.js';
import type { EntryStatus } from '@/types/index.js';

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

function EntryEditPage(): React.ReactElement {
    const { type, id } = useParams({ strict: false }) as {
        type: string;
        id: string;
    };
    const { toast } = useToast();
    const confirm = useConfirm();
    const { t } = useTranslation();
    const navigate = useNavigate();

    const { canUpdate } = usePermissions();
    const entryTypeConfig = adminConfig.entries[type];
    const single = entryTypeConfig?.single ?? type;
    const plural = entryTypeConfig?.plural ?? type;
    const hasSlug = entryTypeConfig?.slug != null;
    const fieldGroups = entryTypeConfig?.fieldGroups ?? [];
    const mainGroups = fieldGroups.filter((g) => g.location !== 'sidebar');
    const sidebarGroups = fieldGroups.filter((g) => g.location === 'sidebar');

    const isReadOnly = !canUpdate(type);

    const { data: entry, isLoading } = useEntry(type, id);

    // Versioning
    const hasVersioning = entryTypeConfig?.versioning === true;
    const { data: versions } = useEntryVersions(type, id, hasVersioning);
    const versionCount = versions?.length ?? 0;

    // Translations
    const hasI18n = entryTypeConfig?.translatable === true;
    const sourceId = entry?.translationOf ?? id;
    const { data: translations } = useEntryTranslations(
        type,
        sourceId,
        hasI18n && entry !== undefined
    );

    const trashEntry = useTrashEntry(type, {
        onSuccess: () => void navigate({ to: `/entries/${type}` }),
    });

    const duplicateEntry = useDuplicateEntry(type, {
        onSuccess: (newEntry) => void navigate({ to: `/entries/${type}/${newEntry.id}` }),
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
        readOnly: isReadOnly,
        saveFn: (data) => Astromech.entries.update(id, data),
        publishFn: (data) => Astromech.entries.update(id, data),
        onSuccess: () => {
            toast({
                message: t('entries.updated', { name: single }),
                variant: 'success',
            });
        },
    });

    function resolvePreviewUrl(
        template: string,
        ent: { slug: string | null; fields: Record<string, unknown> }
    ): string {
        return template.replace(/\{(\w+)\}/g, (_, key) => {
            if (key === 'slug') return ent.slug ?? '';
            return String(ent.fields[key] ?? '');
        });
    }

    if (isLoading) {
        return <PageLoading />;
    }

    return (
        <Page>
            <PageHeader>
                <PageTitle>{entry?.title ?? single}</PageTitle>
                <Breadcrumb
                    items={[
                        { label: plural, to: `/entries/${type}` },
                        {
                            label: t('entries.editTitle', {
                                title: entry?.title ?? single,
                            }),
                        },
                    ]}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {!isReadOnly && form.state.isDirty && (
                        <span className="am-form-layout-dirty-indicator">
                            {t('common.unsavedChanges')}
                        </span>
                    )}
                    {entry != null && <StatusBadge status={entry.status} />}
                    {entryTypeConfig?.previewUrl && entry?.status === 'published' && (
                        <a
                            href={resolvePreviewUrl(entryTypeConfig.previewUrl, entry)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="am-btn am-btn-ghost am-btn-sm"
                        >
                            <ExternalLink size={14} style={{ marginRight: '0.25rem' }} />
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
                    {hasI18n && entry != null && (
                        <LocaleSwitcher
                            sourceId={sourceId}
                            currentEntryId={id}
                            type={type}
                            translations={translations ?? []}
                            allLocales={adminConfig.locales}
                            defaultLocale={adminConfig.defaultLocale}
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
                                            onClick={() =>
                                                confirm({
                                                    title: t(
                                                        'entries.confirmDeleteTitle'
                                                    ),
                                                    description: t(
                                                        'entries.confirmDeleteMessage',
                                                        { name: single.toLowerCase() }
                                                    ),
                                                    confirmLabel: t(
                                                        'entries.confirmDeleteLabel'
                                                    ),
                                                    onConfirm: () =>
                                                        trashEntry.mutate(id),
                                                })
                                            }
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
                        <FormLayoutMain>
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
                                                    field.handleChange(e.target.value)
                                                }
                                                onBlur={field.handleBlur}
                                                required
                                            />
                                            {field.state.meta.errors.length > 0 && (
                                                <p className="am-field-error">
                                                    {field.state.meta.errors[0]}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </form.Field>
                            </Panel>

                            {mainGroups.map((group) => (
                                <Panel
                                    key={group.name}
                                    title={group.label}
                                    {...(group.description !== undefined && {
                                        description: group.description,
                                    })}
                                >
                                    <div className="am-field-list">
                                        {group.fields.map((field) => (
                                            <form.Field key={field.name} name="fields">
                                                {(f) => (
                                                    <FormField
                                                        field={field}
                                                        value={f.state.value[field.name]}
                                                        onChange={(_name, value) =>
                                                            f.handleChange({
                                                                ...f.state.value,
                                                                [field.name]: value,
                                                            })
                                                        }
                                                        disabled={isReadOnly}
                                                    />
                                                )}
                                            </form.Field>
                                        ))}
                                    </div>
                                </Panel>
                            ))}
                        </FormLayoutMain>

                        <FormLayoutSidebar>
                            <form.Field name="status">
                                {(statusField) => (
                                    <form.Field name="publishAt">
                                        {(publishAtField) => (
                                            <PublishPanel
                                                status={statusField.state.value}
                                                publishAt={publishAtField.state.value}
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
                                                        field.handleChange(e.target.value)
                                                    }
                                                    onBlur={field.handleBlur}
                                                    pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
                                                />
                                            </div>
                                        </Panel>
                                    )}
                                </form.Field>
                            )}

                            {sidebarGroups.map((group) => (
                                <Panel
                                    key={group.name}
                                    title={group.label}
                                    {...(group.description !== undefined && {
                                        description: group.description,
                                    })}
                                >
                                    <div className="am-field-list">
                                        {group.fields.map((field) => (
                                            <form.Field key={field.name} name="fields">
                                                {(f) => (
                                                    <FormField
                                                        field={field}
                                                        value={f.state.value[field.name]}
                                                        onChange={(_name, value) =>
                                                            f.handleChange({
                                                                ...f.state.value,
                                                                [field.name]: value,
                                                            })
                                                        }
                                                        disabled={isReadOnly}
                                                    />
                                                )}
                                            </form.Field>
                                        ))}
                                    </div>
                                </Panel>
                            ))}
                            {hasVersioning && (
                                <Panel>
                                    {versionCount > 0 ? (
                                        <Link
                                            to="/entries/$type/$id/versions"
                                            params={{ type, id }}
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
                        </FormLayoutSidebar>
                    </FormLayoutContent>
                </FormLayout>
            </PageContent>
        </Page>
    );
}

export const Route = createFileRoute('/_protected/entries/$type/$id/')({
    component: EntryEditPage,
});
