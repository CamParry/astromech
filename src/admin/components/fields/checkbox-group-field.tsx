import type { BaseFieldProps, SelectOption } from '@/types/index.js';
import { CheckboxGroup } from '@/admin/components/ui/checkbox-group.js';

export function CheckboxGroupField({ name, value, field, onChange }: BaseFieldProps) {
    const options: SelectOption[] = (field.options ?? []).map((opt) => {
        if (typeof opt === 'string') return { value: opt, label: opt };
        return opt;
    });

    const checked: string[] = Array.isArray(value) ? (value as string[]) : [];

    return (
        <CheckboxGroup
            options={options}
            value={checked}
            name={name}
            onChange={(v) => onChange(name, v)}
        />
    );
}
