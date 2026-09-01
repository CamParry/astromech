/**
 * Switches which locale of an entry is being edited. An entry has one id
 * across its locales, so a switch changes the `locale` search param and keeps
 * the id; a locale the entry has no row for fires a "create translation"
 * mutation that writes it first.
 */

import type { EntryHookScope } from '../../hooks/entries';
import { useNavigate } from '@tanstack/react-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { entryEditPath } from '@/admin/utilities/entry-admin-path';
import { useCreateTranslation } from '../../hooks/entries';
import { Select } from '../ui/select';

type LocaleSwitcherProps = {
    /** The entry being edited. One id serves every locale of it. */
    entryId: string;
    /** The locale being edited. */
    currentLocale: string;
    /** Locales the entry has a content row for (i.e. `Entry.locales`). */
    locales: string[];
    /** Locales configured on the entry type's `locales` (or global `locales`). */
    allLocales: string[];
    /** Configured default locale (used for label sorting). */
    defaultLocale: string;
    /** Link base: `/entries/post` or `/plugin/forms/entries/form`. */
    basePath: string;
    type: string;
    /** Mount binding for the create-translation write (plugin types bind theirs). */
    scope?: EntryHookScope;
    compact?: boolean;
};

export function LocaleSwitcher({
    entryId,
    currentLocale,
    locales,
    allLocales,
    defaultLocale,
    basePath,
    type,
    scope,
    compact = false,
}: LocaleSwitcherProps): React.ReactElement {
    const navigate = useNavigate();
    const { t } = useTranslation();

    const [isCreating, setIsCreating] = useState(false);

    const createMutation = useCreateTranslation(type, {
        ...scope,
        onSuccess: (entry) => {
            setIsCreating(false);
            void navigate({
                to: entryEditPath(basePath, entry.id, { locale: entry.locale }),
            });
        },
        onError: () => setIsCreating(false),
    });

    function handleValueChange(value: string | null): void {
        if (value == null || value === currentLocale) return;

        if (locales.includes(value)) {
            void navigate({ to: entryEditPath(basePath, entryId, { locale: value }) });
            return;
        }

        // Missing translation — write the row, then open it.
        setIsCreating(true);
        createMutation.mutate({ id: entryId, locale: value });
    }

    // Sort options: default locale first, others alphabetical; missing locales
    // labeled "Add XX" so the affordance is obvious.
    const sortedLocales = [
        defaultLocale,
        ...allLocales.filter((l) => l !== defaultLocale).sort(),
    ];
    const options = sortedLocales.map((loc) => ({
        value: loc,
        label: locales.includes(loc) ? loc.toUpperCase() : `Add ${loc.toUpperCase()}`,
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
