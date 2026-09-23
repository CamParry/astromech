/**
 * The modal the entry create page opens for a non-default locale, choosing
 * which entry, if any, the new locale joins.
 */

import type { Entry } from 'astromech';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEntriesQuery } from '../../hooks/entries';
import { Button } from '../ui/button';
import { Modal } from '../ui/modal';
import { Stack } from '../ui/page';
import { Select } from '../ui/select';

type CreateMode = 'translate' | 'blank-in-entry' | 'standalone';

export type CreateLocaleModalProps = {
    open: boolean;
    type: string;
    locale: string;
    defaultLocale: string;
    onCancel: () => void;
    onChooseStandalone: () => void;
    onChooseBlankInEntry: (sourceId: string) => void;
    onChooseTranslate: (sourceEntry: Entry) => void;
};

/**
 * Asks how a create in a non-default locale starts: a translation of an
 * existing entry, a blank row joining one, or a new entry of its own.
 */
export function CreateLocaleModal({
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
