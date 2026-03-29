import type { BaseFieldProps, SelectOption } from '@/types/index.js';
import { MultiSelect } from '@/admin/components/ui/multi-select.js';

export function MultiselectField({ name, value, field, required, onChange }: BaseFieldProps) {
    const selectedValues = Array.isArray(value) ? value.map(String) : [];

    const options: SelectOption[] =
        field.options?.map((opt) => {
            if (typeof opt === 'string') return { value: opt, label: opt };
            return opt;
        }) ?? [];

    const currentValue = options.filter((opt) => selectedValues.includes(opt.value));

    return (
        <MultiSelect
            options={options}
            value={currentValue}
            onValueChange={(val) => onChange(name, val.map((v) => v.value))}
            name={name}
            required={!!required}
        />
    );
}
