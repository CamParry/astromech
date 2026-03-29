import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { BaseFieldProps } from '@/types/index.js';
import { Astromech } from '@/sdk/fetch/index.js';
import { MultiSelect } from '@/admin/components/ui/multi-select.js';

type EntryOption = {
    id: string;
    title: string;
    slug: string | null;
};

export function RelationshipField({ name, value, field, required, onChange, disabled }: BaseFieldProps) {
    const { t } = useTranslation();
    const target = field.target || '';
    const multiple = field.multiple || false;
    const [options, setOptions] = useState<EntryOption[]>([]);

    useEffect(() => {
        if (!target) return;
        Astromech.entries.query({ type: target, limit: 'all' })
            .then((result) => {
                setOptions(result.data.map((e) => ({ id: e.id, title: e.title, slug: e.slug })));
            })
            .catch(() => {});
    }, [target]);

    const selectedIds = Array.isArray(value)
        ? value.map(String)
        : value != null
        ? [String(value)]
        : [];
    const currentValue = options.filter((o) => selectedIds.includes(o.id));

    return (
        <MultiSelect<EntryOption>
            options={options}
            value={currentValue}
            itemToStringValue={(e) => e.id}
            itemToStringLabel={(e) => e.title}
            multiple={multiple}
            name={name}
            required={!!required}
            {...(disabled !== undefined && { disabled })}
            placeholder={t('fields.relationshipSelect')}
            onValueChange={(val) => {
                if (!multiple) {
                    onChange(name, val[0]?.id ?? null);
                } else {
                    onChange(name, val.map((v) => v.id));
                }
            }}
        />
    );
}
