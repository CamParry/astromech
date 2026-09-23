/**
 * The entries list toolbar's controls: the status and locale filters, the
 * column menu.
 */

import type { StatusFilter } from '../../hooks/use-list-controller';
import { Menu } from '@base-ui/react/menu';
import { Check, SlidersHorizontal } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { LOCALE_FILTER_ALL } from '../../hooks/use-list-controller';
import { Select } from '../ui/select';

/** The status filter, offering only what the type's statuses and trash allow. */
export function StatusFilterSelect({
    value,
    hasStatuses,
    hasTrash,
    onChange,
}: {
    value: StatusFilter;
    hasStatuses: boolean;
    hasTrash: boolean;
    onChange: (value: string | null) => void;
}): React.ReactElement {
    const { t } = useTranslation();
    const options: { value: StatusFilter; label: string }[] = [
        { value: 'all', label: t('entries.all') },
        ...(hasStatuses
            ? ([
                  { value: 'unpublished', label: t('entries.unpublished') },
                  { value: 'published', label: t('entries.published') },
                  { value: 'scheduled', label: t('entries.scheduled') },
              ] as const)
            : []),
        ...(hasTrash ? [{ value: 'trashed' as const, label: t('entries.trashed') }] : []),
    ];
    return (
        <Select
            value={value}
            onValueChange={onChange}
            options={options}
            triggerPrefix={t('entries.statusFilterPrefix')}
        />
    );
}

/** The locale filter: one configured locale, or all of them. */
export function LocaleFilterSelect({
    value,
    locales,
    onChange,
}: {
    value: string;
    locales: string[];
    onChange: (value: string | null) => void;
}): React.ReactElement {
    const { t } = useTranslation();
    return (
        <Select
            value={value}
            onValueChange={onChange}
            options={[
                ...locales.map((locale) => ({
                    value: locale,
                    label: locale.toUpperCase(),
                })),
                { value: LOCALE_FILTER_ALL, label: t('entries.allLocales') },
            ]}
            triggerPrefix={t('entries.localeFilterPrefix')}
        />
    );
}

/** The menu that shows or hides each column the type can show. */
export function ColumnsMenu({
    columns,
    visible,
    onToggle,
}: {
    columns: { key: string; label: string }[];
    visible: Set<string>;
    onToggle: (key: string) => void;
}): React.ReactElement {
    const { t } = useTranslation();
    return (
        <Menu.Root>
            <Menu.Trigger
                className="am-btn am-btn-secondary am-btn-md am-btn-icon"
                aria-label={t('entries.toggleColumns')}
            >
                <SlidersHorizontal size={14} />
            </Menu.Trigger>
            <Menu.Portal>
                <Menu.Positioner
                    className="am-dropdown-positioner"
                    sideOffset={4}
                    align="end"
                >
                    <Menu.Popup className="am-dropdown-popup">
                        {columns.map((column) => (
                            <Menu.Item
                                key={column.key}
                                className="am-dropdown-item"
                                onClick={() => onToggle(column.key)}
                            >
                                <span
                                    className={
                                        visible.has(column.key)
                                            ? 'am-dropdown-item-icon'
                                            : 'am-dropdown-item-icon am-dropdown-item-icon--hidden'
                                    }
                                >
                                    <Check size={14} />
                                </span>
                                {column.label}
                            </Menu.Item>
                        ))}
                    </Menu.Popup>
                </Menu.Positioner>
            </Menu.Portal>
        </Menu.Root>
    );
}
