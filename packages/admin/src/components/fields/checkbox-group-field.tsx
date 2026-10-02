import type { BaseFieldProps } from 'astromech';
import { useLabel } from '../../i18n/entry-namespace';
import { CheckboxGroup } from '../ui/checkbox-group';
import { useFieldControl } from './field-control-context';

export function CheckboxGroupField({
    name,
    value,
    field,
    onChange,
    disabled,
}: BaseFieldProps) {
    const label = useLabel();
    const { labelId } = useFieldControl();

    const options: { value: string; label: string }[] = (field.options ?? []).map(
        (opt) => {
            if (typeof opt === 'string') return { value: opt, label: opt };
            return { value: opt.value, label: label(opt.label, opt.value) };
        }
    );

    const checked: string[] = Array.isArray(value) ? (value as string[]) : [];

    return (
        <CheckboxGroup
            aria-labelledby={labelId}
            options={options}
            value={checked}
            name={name}
            onChange={(v) => onChange(name, v)}
            {...(disabled !== undefined ? { disabled } : {})}
        />
    );
}
