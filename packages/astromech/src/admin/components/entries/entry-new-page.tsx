/**
 * Shared entry create page body, parameterized by an `EntriesBinding`; serves
 * root and plugin-namespaced entry types. Two-column layout with title,
 * optional slug, and a status panel; non-default-locale creates prompt a modal.
 */

import type { EntriesBinding } from './binding';
import type { Entry, EntryUpdateData } from '@/types/index';
import { useNavigate } from '@tanstack/react-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { EntryFieldColumn } from '@/admin/components/entries/entry-fields-renderer';
import { PublishPanel } from '@/admin/components/entries/publish-panel';
import {
    FieldErrorsProvider,
    FieldWarningsProvider,
} from '@/admin/components/fields/field-errors-context';
import { FieldValidationProvider } from '@/admin/components/fields/field-validation-context';
import { Breadcrumb } from '@/admin/components/ui/breadcrumb';
import { Button } from '@/admin/components/ui/button';
import { Input } from '@/admin/components/ui/input';
import { Modal } from '@/admin/components/ui/modal';
import {
    ButtonGroup,
    FormLayout,
    FormLayoutContent,
    Page,
    PageContent,
    PageHeader,
    PageTitle,
    Stack,
} from '@/admin/components/ui/page';
import { Panel } from '@/admin/components/ui/panel';
import { Select } from '@/admin/components/ui/select';
import { useToast } from '@/admin/components/ui/toast';
import { useEntriesQuery } from '@/admin/hooks/entries';
import { useEntryForm } from '@/admin/hooks/use-entry-form';
import { usePermissions } from '@/admin/hooks/use-permissions';
import { EntryNamespaceProvider, namespaceForScope } from '@/admin/i18n/entry-namespace';
import { resolveAdminEntryType, resolveForm } from '@/admin/rendering/resolve';
import { defaultContentLocale } from '@/admin/utilities/content-locale';
import { entryEditPath } from '@/admin/utilities/entry-admin-path';
import { EntryFormErrors } from './entry-form-errors';

type CreateMode = 'translate' | 'blank-in-entry' | 'standalone';

type CreateLocaleModalProps = {
    open: boolean;
    binding: EntriesBinding;
    locale: string;
    defaultLocale: string;
    onCancel: () => void;
    onChooseStandalone: () => void;
    onChooseBlankInEntry: (sourceId: string) => void;
    onChooseTranslate: (sourceEntry: Entry) => void;
};

function CreateLocaleModal({
    open,
    binding,
    locale,
    defaultLocale,
    onCancel,
    onChooseStandalone,
    onChooseBlankInEntry,
    onChooseTranslate,
}: CreateLocaleModalProps): React.ReactElement {
    const { t } = useTranslation();
    const [mode, setMode] = useState<CreateMode | null>(null);
    const [selectedId, setSelectedId] = useState<string>('');

    // Source entries are existing rows in the default locale (the dominant case).
    const { data: sourceList } = useEntriesQuery(
        {
            type: binding.type,
            locale: defaultLocale,
            limit: 'all',
        },
        { api: binding.api, cacheScope: binding.cacheScope }
    );

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
        if (mode === 'blank-in-entry') onChooseBlankInEntry(source.id);
    }

    const needsPicker = mode === 'translate' || mode === 'blank-in-entry';
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
                    <Button
                        variant="primary"
                        onClick={handleProceed}
                        disabled={!proceedEnabled}
                    >
                        {t('common.continue')}
                    </Button>
                </>
            }
        >
            <Stack gap={5}>
                <RadioOption
                    label={t('entries.createTranslate')}
                    description={t('entries.createTranslateDescription')}
                    checked={mode === 'translate'}
                    onSelect={() => setMode('translate')}
                />
                <RadioOption
                    label={t('entries.createBlankInLocale')}
                    description={t('entries.createBlankInLocaleDescription')}
                    checked={mode === 'blank-in-entry'}
                    onSelect={() => setMode('blank-in-entry')}
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
                                label: e.title || e.id,
                            }))}
                        />
                    </div>
                )}
            </Stack>
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
            style={{
                cursor: 'pointer',
                display: 'flex',
                gap: '0.5rem',
                alignItems: 'flex-start',
            }}
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

export function EntryNewPage({
    binding,
    requestedLocale: requestedLocaleProp,
}: {
    binding: EntriesBinding;
    /** Requested locale from the route search params; defaults to default locale. */
    requestedLocale: string | undefined;
}): React.ReactElement {
    const { type, api, cacheScope, config: entryType, basePath } = binding;
    const navigate = useNavigate();
    const { toast } = useToast();
    const { t } = useTranslation();
    const { hasPermission } = usePermissions();
    const canCreate = hasPermission(binding.permissionFor('create'));

    const capabilities = entryType?.capabilities;
    const hasI18n = capabilities?.translatable === true;
    const requestedLocale = requestedLocaleProp ?? defaultContentLocale();
    const isNonDefaultLocale = hasI18n && requestedLocale !== defaultContentLocale();

    // For non-default-locale creates, hold the entry this locale is being added
    // to (chosen via "blank in this locale"). null = a new entry of its own.
    const [chosenEntryId, setChosenEntryId] = useState<string | null>(null);
    const [modalOpen, setModalOpen] = useState<boolean>(isNonDefaultLocale);

    const resolvedForm = resolveForm(resolveAdminEntryType(entryType, type));
    const { hasTitle, hasSlug, hasStatuses, main, sidebar } = resolvedForm;
    // The two columns together ARE the full field tree the client validates.
    // Derived above the permission bail-out so the memo keeps its hook slot.
    const fieldDefinitions = React.useMemo(() => [...main, ...sidebar], [main, sidebar]);

    if (!canCreate) {
        toast({
            message: t('permissions.forbidden'),
            variant: 'error',
        });
        void navigate({ to: basePath });
        return <></>;
    }
    const single = entryType?.single ?? type;
    const plural = entryType?.plural ?? type;

    const {
        form,
        saveMutation,
        handleSave,
        handlePublish,
        fieldErrors,
        fieldWarnings,
        formErrors,
        fieldValidation,
    } = useEntryForm({
        fieldDefinitions,
        operation: 'create',
        namespace: namespaceForScope(cacheScope),
        hasSlug,
        hasStatuses,
        // Adding a locale to an existing entry is an `update` on that locale,
        // which creates the content row; a new entry is a `create`.
        saveFn: (payload) => writeEntry(payload),
        publishFn: (payload) => writeEntry(payload),
        onSuccess: (entry) => {
            toast({
                message: t('entries.created', { name: single }),
                variant: 'success',
            });
            void navigate({
                to: entryEditPath(basePath, entry.id, { locale: entry.locale }),
            });
        },
    });

    function writeEntry(payload: EntryUpdateData): Promise<Entry> {
        if (chosenEntryId !== null) {
            return api.update({
                type,
                id: chosenEntryId,
                locale: requestedLocale,
                data: payload,
            });
        }
        return api.create({
            type,
            data: { ...payload, ...(hasI18n ? { locale: requestedLocale } : {}) },
        }) as Promise<Entry>;
    }

    function handleModalCancel(): void {
        void navigate({ to: basePath });
    }

    function handleChooseStandalone(): void {
        setChosenEntryId(null);
        setModalOpen(false);
    }

    function handleChooseBlankInEntry(sourceId: string): void {
        setChosenEntryId(sourceId);
        setModalOpen(false);
    }

    function handleChooseTranslate(source: Entry): void {
        // Add the requested locale to the source entry. An empty patch is
        // enough: the missing row inherits the source's own columns.
        void api
            .update({ type, id: source.id, locale: requestedLocale, data: {} })
            .then((entry) => {
                toast({
                    message: t('entries.created', { name: single }),
                    variant: 'success',
                });
                void navigate({
                    to: entryEditPath(basePath, entry.id, { locale: entry.locale }),
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
        <EntryNamespaceProvider namespace={namespaceForScope(cacheScope)}>
            <Page>
                {isNonDefaultLocale && (
                    <CreateLocaleModal
                        open={modalOpen}
                        binding={binding}
                        locale={requestedLocale}
                        defaultLocale={adminConfig.defaultLocale}
                        onCancel={handleModalCancel}
                        onChooseStandalone={handleChooseStandalone}
                        onChooseBlankInEntry={handleChooseBlankInEntry}
                        onChooseTranslate={handleChooseTranslate}
                    />
                )}
                <PageHeader>
                    <PageTitle>
                        <Breadcrumb
                            items={[
                                { label: plural, to: basePath },
                                { label: t('entries.create') },
                            ]}
                        />
                    </PageTitle>
                    <ButtonGroup>
                        {hasStatuses ? (
                            <>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={handleSave}
                                    disabled={saveMutation.isPending}
                                >
                                    {t('entries.saveAsUnpublished')}
                                </Button>
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={handlePublish}
                                    loading={saveMutation.isPending}
                                >
                                    {t('common.publish')}
                                </Button>
                            </>
                        ) : (
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={handleSave}
                                loading={saveMutation.isPending}
                            >
                                {t('common.save')}
                            </Button>
                        )}
                    </ButtonGroup>
                </PageHeader>

                <PageContent>
                    <EntryFormErrors messages={formErrors} />
                    <FieldValidationProvider value={fieldValidation}>
                        <FieldErrorsProvider value={fieldErrors}>
                            <FieldWarningsProvider value={fieldWarnings}>
                                <FormLayout>
                                    <FormLayoutContent>
                                        {/* Main column */}
                                        <Stack gap={8}>
                                            {/* Title + optional slug */}
                                            {(hasTitle || hasSlug) && (
                                                <Panel>
                                                    {hasTitle && (
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
                                                                            field.state
                                                                                .value
                                                                        }
                                                                        onChange={(e) =>
                                                                            field.handleChange(
                                                                                e.target
                                                                                    .value
                                                                            )
                                                                        }
                                                                        onBlur={
                                                                            field.handleBlur
                                                                        }
                                                                        placeholder={`${single} title`}
                                                                        required
                                                                    />
                                                                    {field.state.meta
                                                                        .errors.length >
                                                                        0 && (
                                                                        <p className="am-field-error">
                                                                            {
                                                                                field
                                                                                    .state
                                                                                    .meta
                                                                                    .errors[0]
                                                                            }
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </form.Field>
                                                    )}

                                                    {hasSlug && (
                                                        <form.Field name="slug">
                                                            {(field) => (
                                                                <div
                                                                    className="am-field"
                                                                    style={{
                                                                        marginTop: '1rem',
                                                                    }}
                                                                >
                                                                    <label
                                                                        className="am-field-label"
                                                                        htmlFor="entry-slug"
                                                                    >
                                                                        {t(
                                                                            'entries.slugField'
                                                                        )}
                                                                    </label>
                                                                    <Input
                                                                        id="entry-slug"
                                                                        type="text"
                                                                        value={
                                                                            field.state
                                                                                .value
                                                                        }
                                                                        onChange={(e) =>
                                                                            field.handleChange(
                                                                                e.target
                                                                                    .value
                                                                            )
                                                                        }
                                                                        onBlur={
                                                                            field.handleBlur
                                                                        }
                                                                        placeholder="auto-generated-from-title"
                                                                        pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
                                                                    />
                                                                </div>
                                                            )}
                                                        </form.Field>
                                                    )}
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
                                                    />
                                                )}
                                            </form.Field>
                                        </Stack>

                                        {/* Sidebar column */}
                                        <Stack gap={8}>
                                            {hasStatuses && (
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
                                                    />
                                                )}
                                            </form.Field>
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
