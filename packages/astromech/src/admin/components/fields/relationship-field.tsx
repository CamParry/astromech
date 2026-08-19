import type { BaseFieldProps } from '@/types/index';
import { useEffect, useState } from 'react';
import adminConfig from 'virtual:astromech/admin-config';
import { MultiSelect } from '@/admin/components/ui/multi-select';
import { astromechClient } from '@/transport/http/client/index';

type EntryOption = {
    id: string;
    title: string;
    slug: string | null;
};

export function RelationshipField({
    name,
    value,
    field,
    required,
    onChange,
    disabled,
}: BaseFieldProps) {
    const target = field.target || '';
    const multiple = field.multiple || false;
    // When the target is a titleless entry type, never fall back to a field
    // value for the label (data-leak rule) — show the entry id instead.
    const targetTitleless = adminConfig.entries[target]?.titleField === false;
    const [options, setOptions] = useState<EntryOption[]>([]);

    useEffect(() => {
        if (!target) return;
        astromechClient.entries
            .query({ type: target, limit: 'all' })
            .then((result) => {
                setOptions(
                    result.data.map((e) => ({ id: e.id, title: e.title, slug: e.slug }))
                );
            })
            .catch(() => undefined);
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
            itemToStringLabel={(e) => (targetTitleless ? e.id : e.title)}
            multiple={multiple}
            name={name}
            required={!!required}
            {...(disabled !== undefined && { disabled })}
            onValueChange={(val) => {
                if (!multiple) {
                    onChange(name, val[0]?.id ?? null);
                } else {
                    onChange(
                        name,
                        val.map((v) => v.id)
                    );
                }
            }}
        />
    );
}
