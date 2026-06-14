import type { BaseFieldProps } from '@/types/index.js';
import { RadioGroup } from '@/admin/components/ui/radio-group.js';
import { useLabel } from '@/admin/i18n/entry-namespace.js';

export function RadioGroupField({ name, value, field, onChange }: BaseFieldProps) {
    const label = useLabel();

    const options: { value: string; label: string }[] = (field.options ?? []).map(
        (opt) => {
            if (typeof opt === 'string') return { value: opt, label: opt };
            return { value: opt.value, label: label(opt.label, opt.value) };
        }
    );

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
