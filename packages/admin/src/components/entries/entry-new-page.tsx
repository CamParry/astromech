/**
 * Entry create page for one entry type id, the site's or a plugin's. Two-column layout with title,
 * optional slug, and a status panel; non-default-locale creates prompt a modal.
 */

import type { UseAdminEntryTypeResult } from '../../hooks/use-admin-entry-type';
import type { Entry, EntryUpdateData } from 'astromech';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { astromechUntypedClient } from 'astromech/fetch';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import adminConfig from 'virtual:astromech/admin-config';
import { entryMutations, useEntriesQuery } from '../../hooks/entries';
import { useAdminEntryType } from '../../hooks/use-admin-entry-type';
import { useAdminMutation } from '../../hooks/use-admin-mutation';
import { useEntryForm } from '../../hooks/use-entry-form';
import { queryKeys } from '../../hooks/use-query-keys';
import { EntryNamespaceProvider } from '../../i18n/entry-namespace';
import { resolveForm } from '../../rendering/resolve';
import { defaultContentLocale } from '../../utilities/content-locale';
import { entryEditPath, entryTypeBasePath } from '../../utilities/entry-admin-path';
import { NotFoundPage } from '../layout/not-found-page';
import { Breadcrumb } from '../ui/breadcrumb';
import { Button } from '../ui/button';
import { Modal } from '../ui/modal';
import { ButtonGroup, Page, PageContent, PageHeader, PageTitle, Stack } from '../ui/page';
import { Select } from '../ui/select';
import { useToast } from '../ui/toast';
import {
    EntryFormLayout,
    FieldColumn,
    SlugField,
    StatusField,
    TitleField,
} from './entry-form-fields';

type CreateMode = 'translate' | 'blank-in-entry' | 'standalone';

type CreateLocaleModalProps = {
    open: boolean;
    type: string;
    locale: string;
    defaultLocale: string;
    onCancel: () => void;
    onChooseStandalone: () => void;
    onChooseBlankInEntry: (sourceId: string) => void;
    onChooseTranslate: (sourceEntry: Entry) => void;
};

function CreateLocaleModal({
    open,
    type,
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
    type,
    requestedLocale,
}: {
    /** Entry type id: `post`, or `forms/form` for a plugin's. */
    type: string;
    /** Requested locale from the route search params; defaults to default locale. */
    requestedLocale: string | undefined;
}): React.ReactElement | null {
    const entryType = useAdminEntryType(type);
    if (entryType === null) return <NotFoundPage path={entryTypeBasePath(type)} />;
    if (!entryType.can('create')) return <CreateForbidden to={entryType.basePath} />;
    return (
        <EntryNewBody
            entryType={entryType}
            requestedLocale={requestedLocale ?? defaultContentLocale()}
        />
    );
}

/** Send a user who may not create back to the list, saying why. */
function CreateForbidden({ to }: { to: string }): null {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { t } = useTranslation();
    useEffect(() => {
        toast({ message: t('permissions.forbidden'), variant: 'error' });
        void navigate({ to });
    }, []);
    return null;
}

function EntryNewBody({
    entryType,
    requestedLocale,
}: {
    entryType: UseAdminEntryTypeResult;
    requestedLocale: string;
}): React.ReactElement {
    const { type, config, basePath, namespace } = entryType;
    const navigate = useNavigate();
    const { toast } = useToast();
    const { t } = useTranslation();
    const queryClient = useQueryClient();

    const hasI18n = config.capabilities.translatable;
    const isNonDefaultLocale = hasI18n && requestedLocale !== defaultContentLocale();

    // For non-default-locale creates, hold the entry this locale is being added
    // to (chosen via "blank in this locale"). null = a new entry of its own.
    const [chosenEntryId, setChosenEntryId] = useState<string | null>(null);
    const [modalOpen, setModalOpen] = useState<boolean>(isNonDefaultLocale);

    const { hasTitle, hasSlug, hasStatuses, main, sidebar } = resolveForm(config);
    // The two columns together are the full field tree the client validates.
    const fieldDefinitions = React.useMemo(() => [...main, ...sidebar], [main, sidebar]);

    const createTranslation = useAdminMutation(entryMutations(type).createTranslation, {
        onSuccess: (entry) => handleCreated(entry),
    });

    const entryForm = useEntryForm({
        fieldDefinitions,
        operation: 'create',
        namespace,
        hasSlug,
        hasStatuses,
        saveFn: (payload) => writeEntry(payload),
        publishFn: (payload) => writeEntry(payload),
        onSuccess: (entry) => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.entries.all(type) });
            handleCreated(entry);
        },
    });
    const { form, saveMutation, handleSave, handlePublish } = entryForm;

    function handleCreated(entry: Entry): void {
        toast({
            message: t('entries.created', { name: config.single }),
            variant: 'success',
        });
        void navigate({
            to: entryEditPath(basePath, entry.id, { locale: entry.locale }),
        });
    }

    /**
     * Adding a locale to an existing entry is an `update` on that locale, which
     * creates the content row; a new entry is a `create`.
     */
    function writeEntry(payload: EntryUpdateData): Promise<Entry> {
        if (chosenEntryId !== null) {
            return astromechUntypedClient.entries.update({
                type,
                id: chosenEntryId,
                locale: requestedLocale,
                data: payload,
            });
        }
        return astromechUntypedClient.entries.create({
            type,
            data: { ...payload, ...(hasI18n ? { locale: requestedLocale } : {}) },
        });
    }

    return (
        <EntryNamespaceProvider namespace={namespace}>
            <Page>
                {isNonDefaultLocale && (
                    <CreateLocaleModal
                        open={modalOpen}
                        type={type}
                        locale={requestedLocale}
                        defaultLocale={adminConfig.defaultLocale}
                        onCancel={() => void navigate({ to: basePath })}
                        onChooseStandalone={() => {
                            setChosenEntryId(null);
                            setModalOpen(false);
                        }}
                        onChooseBlankInEntry={(sourceId) => {
                            setChosenEntryId(sourceId);
                            setModalOpen(false);
                        }}
                        // The missing row inherits the source's own columns.
                        onChooseTranslate={(source) =>
                            createTranslation.mutate({
                                id: source.id,
                                locale: requestedLocale,
                            })
                        }
                    />
                )}
                <PageHeader>
                    <PageTitle>
                        <Breadcrumb
                            items={[
                                { label: config.plural, to: basePath },
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
                    <EntryFormLayout
                        state={entryForm}
                        main={
                            <>
                                {hasTitle && (
                                    <TitleField
                                        form={form}
                                        placeholder={`${config.single} title`}
                                    />
                                )}
                                <FieldColumn form={form} nodes={main} />
                            </>
                        }
                        sidebar={
                            <>
                                {hasStatuses && <StatusField form={form} />}
                                {hasSlug && <SlugField form={form} />}
                                <FieldColumn form={form} nodes={sidebar} />
                            </>
                        }
                    />
                </PageContent>
            </Page>
        </EntryNamespaceProvider>
    );
}
