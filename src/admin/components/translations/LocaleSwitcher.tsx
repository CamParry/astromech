/**
 * LocaleSwitcher — shows available locales for an entry and allows navigating
 * to existing translations or creating new ones.
 */

import React, { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Select } from '../ui/index';
import { useToast } from '../ui/index';
import { Astromech } from '../../../sdk/client/index.js';
import type { TranslationInfo } from '../../../types/index.js';

// ============================================================================
// Types
// ============================================================================

type LocaleSwitcherProps = {
    sourceId: string;
    currentEntryId: string;
    collection: string;
    translations: TranslationInfo[];
    allLocales: string[];
    defaultLocale: string;
    compact?: boolean;
};

// ============================================================================
// Component
// ============================================================================

export function LocaleSwitcher({
    sourceId,
    currentEntryId,
    collection,
    translations,
    allLocales,
    defaultLocale,
    compact = false,
}: LocaleSwitcherProps): React.ReactElement {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { toast } = useToast();

    // Current value: either the locale of a translation or "default" for the source
    const currentTranslation = translations.find((tr) => tr.entryId === currentEntryId);
    const currentValue =
        currentTranslation != null ? currentTranslation.locale : 'default';

    const [isCreating, setIsCreating] = useState(false);

    const createMutation = useMutation({
        mutationFn: (locale: string) =>
            Astromech.collections[collection]!.createTranslation(sourceId, locale),
        onSuccess: (newEntry) => {
            setIsCreating(false);
            void navigate({ to: `/collections/${collection}/${newEntry.id}` });
        },
        onError: (err) => {
            setIsCreating(false);
            toast({
                message:
                    err instanceof Error ? err.message : t('translations.createFailed'),
                variant: 'error',
            });
        },
    });

    function handleValueChange(value: string | null): void {
        if (value == null) return;

        if (value === 'default') {
            // Navigate to source
            void navigate({ to: `/collections/${collection}/${sourceId}` });
            return;
        }

        const existingTranslation = translations.find((tr) => tr.locale === value);
        if (existingTranslation != null) {
            void navigate({
                to: `/collections/${collection}/${existingTranslation.entryId}`,
            });
            return;
        }

        // Create new translation
        setIsCreating(true);
        createMutation.mutate(value);
    }

    // Build options: default locale first, then all other locales
    const options = [
        {
            value: 'default',
            label: `${defaultLocale.toUpperCase()}`,
        },
        ...allLocales
            .filter((locale) => locale !== defaultLocale)
            .map((locale) => {
                const existing = translations.find((tr) => tr.locale === locale);
                if (existing != null) {
                    return {
                        value: locale,
                        label: `${locale.toUpperCase()}`,
                    };
                }
                return {
                    value: locale,
                    label: `Add ${locale.toUpperCase()}`,
                };
            }),
    ];

    if (compact) {
        return (
            <Select
                value={currentValue}
                onValueChange={handleValueChange}
                options={options}
                disabled={isCreating || createMutation.isPending}
            />
        );
    }

    return (
        <div className="am-field">
            <label className="am-field__label">{t('translations.locale')}</label>
            <Select
                value={currentValue}
                onValueChange={handleValueChange}
                options={options}
                disabled={isCreating || createMutation.isPending}
            />
        </div>
    );
}
