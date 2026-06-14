import type { BaseFieldProps } from '@/types/index.js';
import { CheckboxGroup } from '@/admin/components/ui/checkbox-group.js';
import { useLabel } from '@/admin/i18n/entry-namespace.js';

export function CheckboxGroupField({ name, value, field, onChange }: BaseFieldProps) {
    const label = useLabel();

    const options: { value: string; label: string }[] = (field.options ?? []).map(
        (opt) => {
            if (typeof opt === 'string') return { value: opt, label: opt };
            return { value: opt.value, label: label(opt.label, opt.value) };
        }
    );

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
