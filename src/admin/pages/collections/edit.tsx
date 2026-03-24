/**
 * Collection entity edit page.
 *
 * Two-column layout: sticky action bar, main content fields left, metadata sidebar right.
 */

import React, { useEffect } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
    Select,
    PageLoading,
    useToast,
    useConfirm,
    Page,
    PageHeader,
    FormLayout,
    FormLayoutContent,
    FormLayoutMain,
    FormLayoutSidebar,
} from '../../components/ui/index';
import { FieldInput } from '../../components/fields/field-input';
import { Astromech } from '../../../sdk/client/index.js';
import { useEntityForm } from '../../hooks/index.js';
import { queryKeys } from '../../hooks/index.js';
import type { EntityStatus } from '../../../types/index.js';

// ============================================================================
// Types
// ============================================================================

type FormValues = {
    title: string;
    slug: string;
    status: EntityStatus;
    publishAt: string;
    fields: Record<string, unknown>;
};

// ============================================================================
// Status badge
// ============================================================================

type StatusBadgeProps = { status: EntityStatus };

function StatusBadge({ status }: StatusBadgeProps): React.ReactElement {
    const { t } = useTranslation();
    const variant =
        status === 'published' ? 'success' : status === 'scheduled' ? 'warning' : 'neutral';
    const label =
        status === 'published'
            ? t('collections.published')
            : status === 'scheduled'
              ? t('collections.scheduled')
              : t('collections.draft');
    return <Badge variant={variant}>{label}</Badge>;
}

// ============================================================================
// Status panel
// ============================================================================

type StatusPanelProps = {
    status: EntityStatus;
    publishAt: string;
    onStatusChange: (s: EntityStatus) => void;
    onPublishAtChange: (v: string) => void;
    statusOptions: { value: string; label: string }[];
    statusPanelTitle: string;
    statusFieldLabel: string;
    publishAtLabel: string;
};

function StatusPanel({
    status,
    publishAt,
    onStatusChange,
    onPublishAtChange,
    statusOptions,
    statusPanelTitle,
    statusFieldLabel,
    publishAtLabel,
}: StatusPanelProps): React.ReactElement {
    return (
        <Panel title={statusPanelTitle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="am-field">
                    <label className="am-field__label">{statusFieldLabel}</label>
                    <Select
                        value={status}
                        onValueChange={(v) => onStatusChange((v ?? 'draft') as EntityStatus)}
                        options={statusOptions}
                    />
                </div>

                {status === 'scheduled' && (
                    <div className="am-field">
                        <label className="am-field__label" htmlFor="entity-publish-at">
                            {publishAtLabel}
                        </label>
                        <Input
                            id="entity-publish-at"
                            type="datetime-local"
                            value={publishAt}
                            onChange={(e) => onPublishAtChange(e.target.value)}
                        />
                    </div>
                )}
            </div>
        </Panel>
    );
}

// ============================================================================
// Page
// ============================================================================

export function CollectionEditPage(): React.ReactElement {
    const { collection, id } = useParams({ strict: false }) as {
        collection: string;
        id: string;
    };
    const { toast } = useToast();
    const confirm = useConfirm();
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    const collectionConfig = adminConfig.collections[collection];
    const single = collectionConfig?.single ?? collection;
    const plural = collectionConfig?.plural ?? collection;
    const hasSlug = collectionConfig?.slug != null;
    const fieldGroups = collectionConfig?.fieldGroups ?? [];

    const statusOptions = [
        { value: 'draft' as EntityStatus, label: t('collections.draft') },
        { value: 'published' as EntityStatus, label: t('collections.published') },
        { value: 'scheduled' as EntityStatus, label: t('collections.scheduled') },
    ];

    const { data: entity, isLoading } = useQuery({
        queryKey: queryKeys.entities.detail(collection, id),
        queryFn: () => Astromech.collections[collection]!.get(id),
    });

    const { form, saveMutation, handleSave, handlePublish } = useEntityForm({
        hasSlug,
        saveFn: (payload) => Astromech.collections[collection]!.update(id, payload),
        publishFn: (payload) => Astromech.collections[collection]!.update(id, payload),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.entities.detail(collection, id) });
            void queryClient.invalidateQueries({ queryKey: queryKeys.entities.all(collection) });
            toast({ message: t('collections.updated', { name: single }), variant: 'success' });
        },
    });

    // Populate form from fetched entity
    useEffect(() => {
        if (entity == null) return;
        form.reset({
            title: entity.title,
            slug: entity.slug ?? '',
            status: entity.status,
            publishAt:
                entity.publishedAt != null
                    ? new Date(entity.publishedAt).toISOString().slice(0, 16)
                    : '',
            fields: (entity.fields as Record<string, unknown>) ?? {},
        } satisfies FormValues);
    // form is stable (useForm returns a stable object), entity is the only reactive dep
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entity]);

    const deleteMutation = useMutation({
        mutationFn: () => Astromech.collections[collection]!.trash(id),
        onSuccess: () => {
            void navigate({ to: `/collections/${collection}` });
            toast({ message: t('collections.movedToTrash', { name: single }), variant: 'success' });
        },
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : t('collections.deleteFailed'),
                variant: 'error',
            });
        },
    });

    const duplicateMutation = useMutation({
        mutationFn: () => {
            const values = form.state.values;
            return Astromech.collections[collection]!.create({
                title: `${values.title || single} (copy)`,
                fields: (values.fields ?? {}) as import('../../../types/index.js').JsonObject,
                status: 'draft',
            });
        },
        onSuccess: (newEntity) => {
            void navigate({ to: `/collections/${collection}/${newEntity.id}` });
            toast({ message: t('collections.duplicated', { name: single }), variant: 'success' });
        },
        onError: (err) => {
            toast({
                message: err instanceof Error ? err.message : t('collections.duplicateFailed'),
                variant: 'error',
            });
        },
    });

    function resolvePreviewUrl(
        template: string,
        ent: { slug: string | null; fields: Record<string, unknown> },
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
                <Breadcrumb
                    items={[
                        { label: plural, to: `/collections/${collection}` },
                        { label: t('collections.editTitle', { title: entity?.title ?? single }) },
                    ]}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {form.state.isDirty && (
                        <span className="am-form-layout__dirty-indicator">{t('common.unsavedChanges')}</span>
                    )}
                    {entity != null && <StatusBadge status={entity.status} />}
                    {collectionConfig?.previewUrl && entity?.status === 'published' && (
                        <a
                            href={resolvePreviewUrl(collectionConfig.previewUrl, entity)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="am-btn am-btn--ghost am-btn--sm"
                        >
                            <ExternalLink size={14} style={{ marginRight: '0.25rem' }} />
                            {t('common.view')}
                        </a>
                    )}
                    {entity?.status !== 'published' && (
                        <Button
                            variant="secondary"
                            onClick={handlePublish}
                            disabled={saveMutation.isPending}
                        >
                            {t('common.publish')}
                        </Button>
                    )}
                    <Button
                        variant="primary"
                        onClick={handleSave}
                        loading={saveMutation.isPending}
                    >
                        {t('common.update')}
                    </Button>
                    <Menu.Root>
                        <Menu.Trigger
                            className="am-btn am-btn--secondary am-btn--md am-btn--icon"
                            aria-label={t('collections.moreActions')}
                        >
                            <MoreHorizontal size={14} />
                        </Menu.Trigger>
                        <Menu.Portal>
                            <Menu.Positioner
                                className="am-topbar__menu-positioner"
                                sideOffset={6}
                                align="end"
                            >
                                <Menu.Popup className="am-topbar__menu-popup">
                                    <Menu.Item
                                        className="am-topbar__menu-item"
                                        onClick={() => duplicateMutation.mutate()}
                                        disabled={duplicateMutation.isPending}
                                    >
                                        <span className="am-topbar__menu-item-icon"><Copy size={14} /></span>
                                        {t('common.duplicate')}
                                    </Menu.Item>
                                    <Menu.Separator className="am-topbar__menu-separator" />
                                    <Menu.Item
                                        className="am-topbar__menu-item am-topbar__menu-item--danger"
                                        onClick={() => confirm({
                                            title: t('collections.confirmDeleteTitle'),
                                            description: t('collections.confirmDeleteMessage', { name: single.toLowerCase() }),
                                            confirmLabel: t('collections.confirmDeleteLabel'),
                                            onConfirm: () => deleteMutation.mutate(),
                                        })}
                                    >
                                        <span className="am-topbar__menu-item-icon"><Trash2 size={14} /></span>
                                        {t('common.delete')}
                                    </Menu.Item>
                                </Menu.Popup>
                            </Menu.Positioner>
                        </Menu.Portal>
                    </Menu.Root>
                </div>
            </PageHeader>

            <FormLayout>
                <FormLayoutContent>
                    {/* Main column */}
                    <FormLayoutMain>
                        {/* Title */}
                        <Panel>
                            <form.Field
                                name="title"
                                validators={{
                                    onChange: ({ value }) =>
                                        value.trim() === '' ? t('collections.titleRequired') : undefined,
                                }}
                            >
                                {(field) => (
                                    <div className="am-field">
                                        <label className="am-field__label" htmlFor="entity-title">
                                            {t('collections.titleField')} <span className="am-field__required">*</span>
                                        </label>
                                        <Input
                                            id="entity-title"
                                            type="text"
                                            value={field.state.value}
                                            onChange={(e) => field.handleChange(e.target.value)}
                                            onBlur={field.handleBlur}
                                            required
                                        />
                                        {field.state.meta.errors.length > 0 && (
                                            <p className="am-field__error">
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
                                                <div className="am-field">
                                                    <label className="am-field__label">
                                                        {field.label ?? field.name}
                                                        {field.required === true && (
                                                            <span className="am-field__required">
                                                                *
                                                            </span>
                                                        )}
                                                    </label>
                                                    {field.description !== undefined && (
                                                        <p className="am-field__hint">
                                                            {field.description}
                                                        </p>
                                                    )}
                                                    <FieldInput
                                                        field={field}
                                                        value={f.state.value[field.name]}
                                                        onChange={(_name, value) =>
                                                            f.handleChange({
                                                                ...f.state.value,
                                                                [field.name]: value,
                                                            })
                                                        }
                                                    />
                                                </div>
                                            )}
                                        </form.Field>
                                    ))}
                                </div>
                            </Panel>
                        ))}
                    </FormLayoutMain>

                    {/* Sidebar column */}
                    <FormLayoutSidebar>
                        <form.Field name="status">
                            {(statusField) => (
                                <form.Field name="publishAt">
                                    {(publishAtField) => (
                                        <StatusPanel
                                            status={statusField.state.value}
                                            publishAt={publishAtField.state.value}
                                            onStatusChange={(s) => statusField.handleChange(s)}
                                            onPublishAtChange={(v) => publishAtField.handleChange(v)}
                                            statusOptions={statusOptions}
                                            statusPanelTitle={t('collections.statusPanel')}
                                            statusFieldLabel={t('collections.statusField')}
                                            publishAtLabel={t('collections.publishAtField')}
                                        />
                                    )}
                                </form.Field>
                            )}
                        </form.Field>

                        {hasSlug && (
                            <form.Field name="slug">
                                {(field) => (
                                    <Panel title={t('collections.slugPanel')}>
                                        <div className="am-field">
                                            <Input
                                                id="entity-slug"
                                                type="text"
                                                value={field.state.value}
                                                onChange={(e) => field.handleChange(e.target.value)}
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
                                                <div className="am-field">
                                                    <label className="am-field__label">
                                                        {field.label ?? field.name}
                                                        {field.required === true && (
                                                            <span className="am-field__required">
                                                                *
                                                            </span>
                                                        )}
                                                    </label>
                                                    {field.description !== undefined && (
                                                        <p className="am-field__hint">
                                                            {field.description}
                                                        </p>
                                                    )}
                                                    <FieldInput
                                                        field={field}
                                                        value={f.state.value[field.name]}
                                                        onChange={(_name, value) =>
                                                            f.handleChange({
                                                                ...f.state.value,
                                                                [field.name]: value,
                                                            })
                                                        }
                                                    />
                                                </div>
                                            )}
                                        </form.Field>
                                    ))}
                                </div>
                            </Panel>
                        ))}
                    </FormLayoutSidebar>
                </FormLayoutContent>
            </FormLayout>

        </Page>
    );
}
