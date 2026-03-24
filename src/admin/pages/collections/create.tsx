/**
 * Collection entity create page.
 *
 * Two-column layout with field groups in main/sidebar positions.
 * Includes title, optional slug, and a status panel.
 */

import React from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import {
    Button,
    Panel,
    Breadcrumb,
    Input,
    Select,
    useToast,
    Page,
    PageHeader,
    ButtonGroup,
    FormLayout,
    FormLayoutMain,
    FormLayoutSidebar,
} from '../../components/ui/index';
import { FieldInput } from '../../components/fields/field-input';
import { Astromech } from '../../../sdk/client/index.js';
import { useEntityForm } from '../../hooks/index.js';
import type { EntityStatus } from '../../../types/index.js';

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

export function CollectionCreatePage(): React.ReactElement {
    const { collection } = useParams({ strict: false }) as { collection: string };
    const navigate = useNavigate();
    const { toast } = useToast();
    const { t } = useTranslation();

    const collectionConfig = adminConfig.collections[collection];
    const single = collectionConfig?.single ?? collection;
    const plural = collectionConfig?.plural ?? collection;
    const hasSlug = collectionConfig?.slug != null;
    const fieldGroups = collectionConfig?.fieldGroups ?? [];

    const mainGroups = fieldGroups.filter((g) => g.location === 'main');
    const sidebarGroups = fieldGroups.filter((g) => g.location === 'sidebar');

    const statusOptions = [
        { value: 'draft', label: t('collections.draft') },
        { value: 'published', label: t('collections.published') },
        { value: 'scheduled', label: t('collections.scheduled') },
    ];

    const { form, saveMutation, handleSave, handlePublish } = useEntityForm({
        hasSlug,
        saveFn: (payload) => Astromech.collections[collection]!.create(payload),
        publishFn: (payload) => Astromech.collections[collection]!.create(payload),
        onSuccess: (entity) => {
            toast({ message: t('collections.created', { name: single }), variant: 'success' });
            void navigate({
                to: '/collections/$collection/$id',
                params: { collection, id: entity.id },
            });
        },
    });

    return (
        <Page>
            <PageHeader>
                <Breadcrumb
                    items={[
                        { label: plural, to: `/collections/${collection}` },
                        { label: t('collections.create') },
                    ]}
                />
                <ButtonGroup>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleSave}
                        disabled={saveMutation.isPending}
                    >
                        {t('collections.saveAsDraft')}
                    </Button>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={handlePublish}
                        loading={saveMutation.isPending}
                    >
                        {t('common.publish')}
                    </Button>
                </ButtonGroup>
            </PageHeader>

            <FormLayout>
                {/* Main column */}
                <FormLayoutMain>
                    {/* Title + optional slug */}
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
                                        placeholder={`${single} title`}
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

                        {hasSlug && (
                            <form.Field name="slug">
                                {(field) => (
                                    <div className="am-field" style={{ marginTop: '1rem' }}>
                                        <label className="am-field__label" htmlFor="entity-slug">
                                            {t('collections.slugField')}
                                        </label>
                                        <Input
                                            id="entity-slug"
                                            type="text"
                                            value={field.state.value}
                                            onChange={(e) => field.handleChange(e.target.value)}
                                            onBlur={field.handleBlur}
                                            placeholder="auto-generated-from-title"
                                            pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
                                        />
                                    </div>
                                )}
                            </form.Field>
                        )}
                    </Panel>

                    {mainGroups.map((group) => (
                        <Panel
                            key={group.name}
                            title={group.label}
                            {...(group.description !== undefined && { description: group.description })}
                        >
                            <div className="am-field-list">
                                {group.fields.map((field) => (
                                    <form.Field key={field.name} name="fields">
                                        {(f) => (
                                            <div className="am-field">
                                                <label className="am-field__label">
                                                    {field.label ?? field.name}
                                                    {field.required === true && (
                                                        <span className="am-field__required">*</span>
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

                    {sidebarGroups.map((group) => (
                        <Panel
                            key={group.name}
                            title={group.label}
                            {...(group.description !== undefined && { description: group.description })}
                        >
                            <div className="am-field-list">
                                {group.fields.map((field) => (
                                    <form.Field key={field.name} name="fields">
                                        {(f) => (
                                            <div className="am-field">
                                                <label className="am-field__label">
                                                    {field.label ?? field.name}
                                                    {field.required === true && (
                                                        <span className="am-field__required">*</span>
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
            </FormLayout>
        </Page>
    );
}
