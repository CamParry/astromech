/**
 * Shared entry create page body.
 *
 * Parameterized by an `EntriesMount`; serves root and plugin-namespaced
 * entry types. Field layout comes from the definition layer:
 * `deriveFormDefinition(config)` splits field groups into main/sidebar/tab and
 * resolves the title/slug/status capability flags; each field input is
 * resolved from the field registry by type (Phase 4).
 *
 * Two-column layout with field groups in main/sidebar positions. Includes
 * title, optional slug, and a status panel. Non-default-locale creation
 * surfaces a modal asking whether to translate an existing entry, start blank
 * in the new locale (joining an existing group), or create a fresh standalone
 * entry.
 */

import React, { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
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
    FormLayoutContent,
    Stack,
} from '@/admin/components/ui/index.js';
import { EntryFieldColumn } from '@/admin/components/entries/entry-fields-renderer.js';
import {
    EntryNamespaceProvider,
    namespaceForScope,
} from '@/admin/i18n/entry-namespace.js';
import { PublishPanel } from '@/admin/components/entries/PublishPanel.js';
import { useEntryForm, useEntriesQuery, usePermissions } from '@/admin/hooks/index.js';
import type { Entry } from '@/types/index.js';
import {
    deriveFormDefinition,
    resolveConfigForDerive,
} from '@/admin/definitions/derive.js';
import { resolveContentLocale } from '@/utilities/locale.js';
import type { EntriesMount } from './mount.js';

// ============================================================================
// Types
// ============================================================================

type CreateMode = 'translate' | 'blank-in-group' | 'standalone';

// ============================================================================
// Modal
// ============================================================================

type CreateLocaleModalProps = {
    open: boolean;
    mount: EntriesMount;
    locale: string;
    defaultLocale: string;
    onCancel: () => void;
    onChooseStandalone: () => void;
    onChooseBlankInGroup: (sourceId: string, localeGroup: string) => void;
    onChooseTranslate: (sourceEntry: Entry) => void;
};

function CreateLocaleModal({
    open,
    mount,
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
    const { data: sourceList } = useEntriesQuery(
        {
            type: mount.type,
            locale: defaultLocale,
            limit: 'all',
        },
        { api: mount.api, cacheScope: mount.cacheScope }
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
        if (mode === 'blank-in-group')
            onChooseBlankInGroup(source.id, source.localeGroup);
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

// ============================================================================
// Page
// ============================================================================

export function EntryNewPage({
    mount,
    requestedLocale: requestedLocaleProp,
}: {
    mount: EntriesMount;
    /** Requested locale from the route search params; defaults to default locale. */
    requestedLocale: string | undefined;
}): React.ReactElement {
    const { type, api, cacheScope, config: entryTypeConfig, basePath } = mount;
    const navigate = useNavigate();
    const { toast } = useToast();
    const { t } = useTranslation();
    const { hasPermission } = usePermissions();
    const canCreate = hasPermission(mount.permissionFor('create'));

    const capabilities = entryTypeConfig?.capabilities;
    const hasI18n = capabilities?.translatable === true;
    const defaultContentLocale =
        resolveContentLocale(adminConfig.defaultLocale, adminConfig.locales) ??
        adminConfig.locales[0] ??
        adminConfig.defaultLocale;
    const requestedLocale = requestedLocaleProp ?? defaultContentLocale;
    const isNonDefaultLocale = hasI18n && requestedLocale !== defaultContentLocale;

    // For non-default-locale creates, hold a chosen localeGroup (when joining
    // an existing group via "blank in this locale"). null = fresh standalone group.
    const [chosenLocaleGroup, setChosenLocaleGroup] = useState<string | null>(null);
    const [modalOpen, setModalOpen] = useState<boolean>(isNonDefaultLocale);

    if (!canCreate) {
        toast({
            message: t('permissions.forbidden'),
            variant: 'error',
        });
        void navigate({ to: basePath });
        return <></>;
    }
    const single = entryTypeConfig?.single ?? type;
    const plural = entryTypeConfig?.plural ?? type;
    const formDef = deriveFormDefinition(resolveConfigForDerive(entryTypeConfig, type));
    const { hasTitle, hasSlug, hasStatuses, main, sidebar } = formDef;

    const { form, saveMutation, handleSave, handlePublish } = useEntryForm({
        hasSlug,
        hasStatuses,
        saveFn: (payload) =>
            api.create({
                type,
                ...payload,
                ...(hasI18n ? { locale: requestedLocale } : {}),
                ...(chosenLocaleGroup ? { localeGroup: chosenLocaleGroup } : {}),
            }) as Promise<Entry>,
        publishFn: (payload) =>
            api.create({
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
                to: `${basePath}/${entry.id}`,
            });
        },
    });

    function handleModalCancel(): void {
        void navigate({ to: basePath });
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
        void api
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
                    to: `${basePath}/${entry.id}`,
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
                        mount={mount}
                        locale={requestedLocale}
                        defaultLocale={adminConfig.defaultLocale}
                        onCancel={handleModalCancel}
                        onChooseStandalone={handleChooseStandalone}
                        onChooseBlankInGroup={handleChooseBlankInGroup}
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
                                                            placeholder={`${single} title`}
                                                            required
                                                        />
                                                        {field.state.meta.errors.length >
                                                            0 && (
                                                            <p className="am-field-error">
                                                                {
                                                                    field.state.meta
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
                                                                field.handleChange(
                                                                    e.target.value
                                                                )
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
                                            <form.Field name="publishAt">
                                                {(publishAtField) => (
                                                    <PublishPanel
                                                        status={statusField.state.value}
                                                        publishAt={
                                                            publishAtField.state.value
                                                        }
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
                </PageContent>
            </Page>
        </EntryNamespaceProvider>
    );
}
