/**
 * Entry create page.
 *
 * Two-column layout with field groups in main/sidebar positions.
 * Includes title, optional slug, and a status panel.
 */

import React from 'react';
import { createFileRoute, useParams, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import {
    Button,
    Panel,
    Breadcrumb,
    Input,
    useToast,
    Page,
    PageHeader,
    PageTitle,
    PageContent,
    ButtonGroup,
    FormLayout,
    FormLayoutMain,
    FormLayoutSidebar,
} from '@/admin/components/ui/index.js';
import { FormField } from '@/admin/components/fields/form-field.js';
import { PublishPanel } from '@/admin/components/entries/PublishPanel.js';
import { Astromech } from '@/sdk/fetch/index.js';
import { useEntryForm, usePermissions } from '@/admin/hooks/index.js';

// ============================================================================
// Page
// ============================================================================

function EntryCreatePage(): React.ReactElement {
    const { type } = useParams({ strict: false }) as { type: string };
    const navigate = useNavigate();
    const { toast } = useToast();
    const { t } = useTranslation();
    const { canCreate } = usePermissions();

    const entryTypeConfig = adminConfig.entries[type];

    if (!canCreate(type)) {
        toast({
            message: t('permissions.forbidden'),
            variant: 'error',
        });
        void navigate({ to: '/entries/$type', params: { type } });
        return <></>;
    }
    const single = entryTypeConfig?.single ?? type;
    const plural = entryTypeConfig?.plural ?? type;
    const hasSlug = entryTypeConfig?.slug != null;
    const fieldGroups = entryTypeConfig?.fieldGroups ?? [];

    const mainGroups = fieldGroups.filter((g) => g.location === 'main');
    const sidebarGroups = fieldGroups.filter((g) => g.location === 'sidebar');

    const { form, saveMutation, handleSave, handlePublish } = useEntryForm({
        hasSlug,
        saveFn: (payload) => Astromech.entries.create({ type, ...payload }),
        publishFn: (payload) => Astromech.entries.create({ type, ...payload }),
        onSuccess: (entry) => {
            toast({
                message: t('entries.created', { name: single }),
                variant: 'success',
            });
            void navigate({
                to: '/entries/$type/$id',
                params: { type, id: entry.id },
            });
        },
    });

    return (
        <Page>
            <PageHeader>
                <PageTitle>{t('entries.create')}</PageTitle>
                <Breadcrumb
                    items={[
                        { label: plural, to: `/entries/${type}` },
                        { label: t('entries.create') },
                    ]}
                />
                <ButtonGroup>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleSave}
                        disabled={saveMutation.isPending}
                    >
                        {t('entries.saveAsDraft')}
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

            <PageContent>
                <FormLayout>
                    {/* Main column */}
                    <FormLayoutMain>
                        {/* Title + optional slug */}
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
                                            <span className="am-field-required">*</span>
                                        </label>
                                        <Input
                                            id="entry-title"
                                            type="text"
                                            value={field.state.value}
                                            onChange={(e) =>
                                                field.handleChange(e.target.value)
                                            }
                                            onBlur={field.handleBlur}
                                            placeholder={`${single} title`}
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

                            {hasSlug && (
                                <form.Field name="slug">
                                    {(field) => (
                                        <div
                                            className="am-field"
                                            style={{ marginTop: '1rem' }}
                                        >
                                            <label
                                                className="am-field-label"
                                                htmlFor="entry-slug"
                                            >
                                                {t('entries.slugField')}
                                            </label>
                                            <Input
                                                id="entry-slug"
                                                type="text"
                                                value={field.state.value}
                                                onChange={(e) =>
                                                    field.handleChange(e.target.value)
                                                }
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
                                                />
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
                                        <PublishPanel
                                            status={statusField.state.value}
                                            publishAt={publishAtField.state.value}
                                            onStatusChange={(s) =>
                                                statusField.handleChange(s)
                                            }
                                            onPublishAtChange={(v) =>
                                                publishAtField.handleChange(v)
                                            }
                                        />
                                    )}
                                </form.Field>
                            )}
                        </form.Field>

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
                                                />
                                            )}
                                        </form.Field>
                                    ))}
                                </div>
                            </Panel>
                        ))}
                    </FormLayoutSidebar>
                </FormLayout>
            </PageContent>
        </Page>
    );
}

export const Route = createFileRoute('/_protected/entries/$type/new')({
    component: EntryCreatePage,
});
