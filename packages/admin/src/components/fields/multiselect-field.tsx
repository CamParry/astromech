import type { BaseFieldProps } from 'astromech';
import { useLabel } from '../../i18n/entry-namespace';
import { MultiSelect } from '../ui/multi-select';
import { useFieldControl } from './field-control-context';

export function MultiselectField({
    name,
    value,
    field,
    required,
    onChange,
    disabled,
}: BaseFieldProps) {
    const label = useLabel();
    const { controlId } = useFieldControl();
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
            id={controlId}
            name={name}
            required={!!required}
            {...(disabled !== undefined ? { disabled } : {})}
        />
    );
}
