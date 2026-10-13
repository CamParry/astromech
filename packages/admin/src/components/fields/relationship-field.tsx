import type { BaseFieldProps } from 'astromech';
import { astromechUntypedClient } from 'astromech/fetch';
import { useEffect, useState } from 'react';
import adminConfig from 'virtual:astromech/admin-config';
import { MultiSelect } from '../ui/multi-select';
import { useFieldControl } from './field-control-context';

type TargetOption = {
    id: string;
    title: string;
    slug: string | null;
};

/**
 * Every record `target` names, as options. `users` and `media` are resources
 * with their own API, not entry types the entries API knows.
 */
async function fetchOptions(target: string): Promise<TargetOption[]> {
    if (target === 'users') {
        const result = await astromechUntypedClient.users.query({ limit: 'all' });
        return result.data.map((u) => ({ id: u.id, title: u.name, slug: null }));
    }
    if (target === 'media') {
        const result = await astromechUntypedClient.media.query({ limit: 'all' });
        return result.data.map((m) => ({
            id: m.id,
            title: m.title ?? m.filename,
            slug: null,
        }));
    }
    const result = await astromechUntypedClient.entries.query({
        type: target,
        limit: 'all',
    });
    return result.data.map((e) => ({ id: e.id, title: e.title, slug: e.slug }));
}

export function RelationshipField({
    name,
    value,
    field,
    required,
    onChange,
    disabled,
}: BaseFieldProps) {
    const { controlId } = useFieldControl();
    const target = field.target || '';
    const multiple = field.multiple || false;
    // When the target is a titleless entry type, never fall back to a field
    // value for the label (data-leak rule) — show the entry id instead.
    const targetTitleless = adminConfig.entryTypes[target]?.titleField === false;
    const [options, setOptions] = useState<TargetOption[]>([]);

    useEffect(() => {
        if (!target) return;
        fetchOptions(target)
            .then(setOptions)
            .catch(() => undefined);
    }, [target]);

    const selectedIds = Array.isArray(value)
        ? value.map(String)
        : value != null
          ? [String(value)]
          : [];
    const currentValue = options.filter((o) => selectedIds.includes(o.id));

    return (
        <MultiSelect<TargetOption>
            options={options}
            value={currentValue}
            itemToStringValue={(e) => e.id}
            itemToStringLabel={(e) => (targetTitleless ? e.id : e.title)}
            multiple={multiple}
            id={controlId}
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
