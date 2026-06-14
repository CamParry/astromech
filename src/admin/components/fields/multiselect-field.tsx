import type { BaseFieldProps } from '@/types/index.js';
import { MultiSelect } from '@/admin/components/ui/multi-select.js';
import { useLabel } from '@/admin/i18n/entry-namespace.js';

export function MultiselectField({
    name,
    value,
    field,
    required,
    onChange,
}: BaseFieldProps) {
    const label = useLabel();
    const selectedValues = Array.isArray(value) ? value.map(String) : [];

    const options: { value: string; label: string }[] =
        field.options?.map((opt) => {
            if (typeof opt === 'string') return { value: opt, label: opt };
            return { value: opt.value, label: label(opt.label, opt.value) };
        }) ?? [];

    const currentValue = options.filter((opt) => selectedValues.includes(opt.value));

    return (
        <MultiSelect
            options={options}
            value={currentValue}
            onValueChange={(val) =>
                onChange(
                    name,
                    val.map((v) => v.value)
                )
            }
            name={name}
            required={!!required}
        />
    );
}
