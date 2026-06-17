/**
 * LocaleSwitcher — shows available locales for an entry's group and allows
 * navigating to existing sibling rows or creating new translations.
 *
 * Reads {@link Entry.locales} directly (no separate query). For missing locales,
 * fires the "create translation" mutation which dispatches Astromech.entries.duplicate
 * with the source's localeGroup, joining the new row to the existing group.
 */

import React, { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Select } from '../ui/index';
import { useCreateTranslation } from '../../hooks/entries.js';

// ============================================================================
// Types
// ============================================================================

type LocaleSwitcherProps = {
    /** The entry currently being viewed/edited. */
    currentEntryId: string;
    /** Map of locale code → entry id (i.e. Entry.locales). */
    locales: Record<string, string>;
    /** Locales configured on the entry type's `locales` (or global `locales`). */
    allLocales: string[];
    /** Configured default locale (used for fallback / label sorting). */
    defaultLocale: string;
    type: string;
    compact?: boolean;
};

// ============================================================================
// Component
// ============================================================================

export function LocaleSwitcher({
    currentEntryId,
    locales,
    allLocales,
    defaultLocale,
    type,
    compact = false,
}: LocaleSwitcherProps): React.ReactElement {
    const navigate = useNavigate();
    const { t } = useTranslation();

    // Determine which locale this entry is. The locales map always contains
    // self, so reverse-lookup is reliable.
    const currentLocale =
        Object.entries(locales).find(([, id]) => id === currentEntryId)?.[0] ??
        defaultLocale;

    const [isCreating, setIsCreating] = useState(false);

    const createMutation = useCreateTranslation(type, {
        onSuccess: (newEntry) => {
            setIsCreating(false);
            void navigate({ to: `/entries/${type}/${newEntry.id}` });
        },
        onError: () => setIsCreating(false),
    });

    function handleValueChange(value: string | null): void {
        if (value == null || value === currentLocale) return;

        const existing = locales[value];
        if (existing != null) {
            void navigate({ to: `/entries/${type}/${existing}` });
            return;
        }

        // Missing translation — create one joining this group via duplicate.
        setIsCreating(true);
        createMutation.mutate({ sourceId: currentEntryId, locale: value });
    }

    // Sort options: default locale first, others alphabetical; missing locales
    // labeled "Add XX" so the affordance is obvious.
    const sortedLocales = [
        defaultLocale,
        ...allLocales.filter((l) => l !== defaultLocale).sort(),
    ];
    const options = sortedLocales.map((loc) => ({
        value: loc,
        label:
            locales[loc] != null
                ? loc.toUpperCase()
                : `Add ${loc.toUpperCase()}`,
    }));

    if (compact) {
        return (
            <Select
                value={currentLocale}
                onValueChange={handleValueChange}
                options={options}
                disabled={isCreating || createMutation.isPending}
            />
        );
    }

    return (
        <div className="am-field">
            <label className="am-field-label">{t('translations.locale')}</label>
            <Select
                value={currentLocale}
                onValueChange={handleValueChange}
                options={options}
                disabled={isCreating || createMutation.isPending}
            />
        </div>
    );
}
