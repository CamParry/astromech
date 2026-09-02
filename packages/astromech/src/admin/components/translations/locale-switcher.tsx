/**
 * Switches which locale of a resource is being edited. A resource keeps one
 * address across its locales, so a switch changes the `locale` search param
 * and keeps that address. What a locale with no row yet costs differs by
 * resource: an entry is written first by `useCreateTranslation`, while a
 * global's caller passes `onSelectMissing` and simply opens the empty form,
 * whose first save creates the row.
 */

import type { EntryHookScope } from '../../hooks/entries';
import { useNavigate } from '@tanstack/react-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { entryEditPath } from '@/admin/utilities/entry-admin-path';
import { useCreateTranslation } from '../../hooks/entries';
import { Select } from '../ui/select';

type LocaleSwitcherProps = {
    /** The resource being edited. One address serves every locale of it. */
    id: string;
    /** The locale being edited. */
    currentLocale: string;
    /** Locales the resource has a content row for (i.e. `Entry.locales`). */
    locales: string[];
    /** Locales configured on the entry type's `locales` (or global `locales`). */
    allLocales: string[];
    /** Configured default locale (used for label sorting). */
    defaultLocale: string;
    /** Link base: `/entries/post` or `/plugin/forms/entries/form`. */
    basePath: string;
    /** Entry type id. Needed only for the create-translation write. */
    type?: string;
    /** Mount binding for the create-translation write (plugin types bind theirs). */
    scope?: EntryHookScope;
    /**
     * Take over a locale the resource has no row for. When given, the switcher
     * calls this instead of writing the row itself.
     */
    onSelectMissing?: (locale: string) => void;
    compact?: boolean;
};

export function LocaleSwitcher({
    id,
    currentLocale,
    locales,
    allLocales,
    defaultLocale,
    basePath,
    type,
    scope,
    onSelectMissing,
    compact = false,
}: LocaleSwitcherProps): React.ReactElement {
    const navigate = useNavigate();
    const { t } = useTranslation();

    const [isCreating, setIsCreating] = useState(false);

    const createMutation = useCreateTranslation(type ?? '', {
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
            void navigate({ to: entryEditPath(basePath, id, { locale: value }) });
            return;
        }

        // Missing translation — the caller takes it over, or the row is written
        // by `update` on that locale and then opened.
        if (onSelectMissing !== undefined) {
            onSelectMissing(value);
            return;
        }
        setIsCreating(true);
        createMutation.mutate({ id, locale: value });
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
