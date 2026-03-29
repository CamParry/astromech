import type { BaseFieldProps, SelectOption } from '@/types/index.js';
import { RadioGroup } from '@/admin/components/ui/radio-group.js';

export function RadioGroupField({ name, value, field, onChange }: BaseFieldProps) {
    const options: SelectOption[] = (field.options ?? []).map((opt) => {
        if (typeof opt === 'string') return { value: opt, label: opt };
        return opt;
    });

    const selected = typeof value === 'string' ? value : '';

    return (
        <RadioGroup
            options={options}
            value={selected}
            onChange={(v) => onChange(name, v)}
            name={name}
        />
    );
}
