import type { BaseFieldProps } from 'astromech';
import { useLabel } from '../../i18n/entry-namespace';
import { RadioGroup } from '../ui/radio-group';

export function RadioGroupField({
    name,
    value,
    field,
    onChange,
    disabled,
}: BaseFieldProps) {
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
            {...(disabled !== undefined ? { disabled } : {})}
        />
    );
}
