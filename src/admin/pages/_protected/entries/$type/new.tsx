/**
 * Entry create page.
 *
 * Two-column layout with field groups in main/sidebar positions.
 * Includes title, optional slug, and a status panel.
 *
 * Non-default-locale creation surfaces a modal asking whether to translate an
 * existing entry, start blank in the new locale (joining an existing group),
 * or create a fresh standalone entry. See specs/symmetric-locale-model.md §9.
 */

import React, { useState } from 'react';
import { createFileRoute, useParams, useNavigate, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import {
    Button,
    Modal,
    Panel,
    Breadcrumb,
    Input,
    Select,
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
import { useEntryForm, useEntriesQuery, usePermissions } from '@/admin/hooks/index.js';
import type { Entry } from '@/types/index.js';

// ============================================================================
// Types
// ============================================================================

type CreateMode = 'translate' | 'blank-in-group' | 'standalone';

type SearchParams = {
    locale?: string;
};

// ============================================================================
// Modal
// ============================================================================

type CreateLocaleModalProps = {
    open: boolean;
    type: string;
    locale: string;
    defaultLocale: string;
    onCancel: () => void;
    onChooseStandalone: () => void;
    onChooseBlankInGroup: (sourceId: string, localeGroup: string) => void;
    onChooseTranslate: (sourceEntry: Entry) => void;
};

function CreateLocaleModal({
    open,
    type,
    locale,
    defaultLocale,
    onCancel,
    onChooseStandalone,
    onChooseBlankInGroup,
    onChooseTranslate,
}: CreateLocaleModalProps): React.ReactElement {
    const { t } = useTranslation();
    const [mode, setMode] = useState<CreateMode | null>(null);
    const [selectedId, setSelectedId] = useState<string>('');

    // Source entries are existing rows in the default locale (the dominant case).
    const { data: sourceList } = useEntriesQuery({
        type,
        locale: defaultLocale,
        limit: 'all',
    });

    const sourceEntries = sourceList?.data ?? [];

    function handleProceed(): void {
        if (mode === 'standalone') {
            onChooseStandalone();
            return;
        }
        if (!selectedId) return;
        const source = sourceEntries.find((e) => e.id === selectedId);
        if (!source) return;
        if (mode === 'translate') onChooseTranslate(source);
        if (mode === 'blank-in-group') onChooseBlankInGroup(source.id, source.localeGroup);
    }

    const needsPicker = mode === 'translate' || mode === 'blank-in-group';
    const proceedEnabled = mode === 'standalone' || (needsPicker && selectedId);

    return (
        <Modal
            open={open}
            onClose={onCancel}
            title={t('entries.createInLocaleTitle', { locale: locale.toUpperCase() })}
            footer={
                <>
                    <Button variant="secondary" onClick={onCancel}>
                        {t('common.cancel')}
                    </Button>
                    <Button variant="primary" onClick={handleProceed} disabled={!proceedEnabled}>
                        {t('common.continue')}
                    </Button>
                </>
            }
        >
            <div className="am-field-list">
                <RadioOption
                    label={t('entries.createTranslate')}
                    description={t('entries.createTranslateDescription')}
                    checked={mode === 'translate'}
                    onSelect={() => setMode('translate')}
                />
                <RadioOption
                    label={t('entries.createBlankInLocale')}
                    description={t('entries.createBlankInLocaleDescription')}
                    checked={mode === 'blank-in-group'}
                    onSelect={() => setMode('blank-in-group')}
                />
                <RadioOption
                    label={t('entries.createStandalone')}
                    description={t('entries.createStandaloneDescription')}
                    checked={mode === 'standalone'}
                    onSelect={() => setMode('standalone')}
                />

                {needsPicker && (
                    <div className="am-field">
                        <label className="am-field-label">
                            {mode === 'translate'
                                ? t('entries.pickSourceEntry')
                                : t('entries.pickGroupToJoin')}
                        </label>
                        <Select
                            value={selectedId}
                            onValueChange={(v) => setSelectedId(v ?? '')}
                            options={sourceEntries.map((e) => ({
                                value: e.id,
                                label: e.title,
                            }))}
                        />
                    </div>
                )}
            </div>
        </Modal>
    );
}

function RadioOption({
    label,
    description,
    checked,
    onSelect,
}: {
    label: string;
    description: string;
    checked: boolean;
    onSelect: () => void;
}): React.ReactElement {
    return (
        <label
            className="am-field"
            style={{ cursor: 'pointer', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}
        >
            <input
                type="radio"
                checked={checked}
                onChange={onSelect}
                style={{ marginTop: '0.25rem' }}
            />
            <span>
                <span style={{ fontWeight: 500, display: 'block' }}>{label}</span>
                <span className="am-text-sm am-text-muted">{description}</span>
            </span>
        </label>
    );
}

// ============================================================================
// Page
// ============================================================================

function EntryCreatePage(): React.ReactElement {
    const { type } = useParams({ strict: false }) as { type: string };
    const search = useSearch({ strict: false }) as SearchParams;
    const navigate = useNavigate();
    const { toast } = useToast();
    const { t } = useTranslation();
    const { canCreate } = usePermissions();

    const entryTypeConfig = adminConfig.entries[type];
    const hasI18n = entryTypeConfig?.translatable === true;
    const requestedLocale = search.locale ?? adminConfig.defaultLocale;
    const isNonDefaultLocale = hasI18n && requestedLocale !== adminConfig.defaultLocale;

    // For non-default-locale creates, hold a chosen localeGroup (when joining
    // an existing group via "blank in this locale"). null = fresh standalone group.
    const [chosenLocaleGroup, setChosenLocaleGroup] = useState<string | null>(null);
    const [modalOpen, setModalOpen] = useState<boolean>(isNonDefaultLocale);

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
        saveFn: (payload) =>
            Astromech.entries.create({
                type,
                ...payload,
                ...(hasI18n ? { locale: requestedLocale } : {}),
                ...(chosenLocaleGroup ? { localeGroup: chosenLocaleGroup } : {}),
            }) as Promise<Entry>,
        publishFn: (payload) =>
            Astromech.entries.create({
                type,
                ...payload,
                ...(hasI18n ? { locale: requestedLocale } : {}),
                ...(chosenLocaleGroup ? { localeGroup: chosenLocaleGroup } : {}),
            }) as Promise<Entry>,
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

    function handleModalCancel(): void {
        void navigate({ to: '/entries/$type', params: { type } });
    }

    function handleChooseStandalone(): void {
        setChosenLocaleGroup(null);
        setModalOpen(false);
    }

    function handleChooseBlankInGroup(_sourceId: string, localeGroup: string): void {
        setChosenLocaleGroup(localeGroup);
        setModalOpen(false);
    }

    function handleChooseTranslate(source: Entry): void {
        // Duplicate the source into the requested locale, joining its group.
        void Astromech.entries
            .duplicate({
                type,
                id: source.id,
                overrides: {
                    locale: requestedLocale,
                    localeGroup: source.localeGroup,
                },
            })
            .then((entry) => {
                toast({
                    message: t('entries.created', { name: single }),
                    variant: 'success',
                });
                void navigate({
                    to: '/entries/$type/$id',
                    params: { type, id: entry.id },
                });
            })
            .catch((err: unknown) => {
                toast({
                    message: err instanceof Error ? err.message : 'Failed',
                    variant: 'error',
                });
            });
    }

    return (
        <Page>
            {isNonDefaultLocale && (
                <CreateLocaleModal
                    open={modalOpen}
                    type={type}
                    locale={requestedLocale}
                    defaultLocale={adminConfig.defaultLocale}
                    onCancel={handleModalCancel}
                    onChooseStandalone={handleChooseStandalone}
                    onChooseBlankInGroup={handleChooseBlankInGroup}
                    onChooseTranslate={handleChooseTranslate}
                />
            )}
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
    validateSearch: (search: Record<string, unknown>): SearchParams => {
        const locale = search['locale'];
        return typeof locale === 'string' ? { locale } : {};
    },
});
