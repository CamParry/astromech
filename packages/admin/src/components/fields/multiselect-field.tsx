import type { BaseFieldProps } from 'astromech';
import { useLabel } from '../../i18n/label-namespace';
import { MultiSelect } from '../ui/multi-select';
import { useFieldControl } from './field-control-context';
import { fieldOptions } from './field-options';

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

    const options = fieldOptions(field, label);

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
