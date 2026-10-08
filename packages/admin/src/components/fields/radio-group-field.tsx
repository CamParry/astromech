import type { BaseFieldProps } from 'astromech';
import { useLabel } from '../../i18n/label-namespace';
import { RadioGroup } from '../ui/radio-group';
import { useFieldControl } from './field-control-context';
import { fieldOptions } from './field-options';

export function RadioGroupField({
    name,
    value,
    field,
    required,
    onChange,
    disabled,
}: BaseFieldProps) {
    const label = useLabel();
    const { labelId } = useFieldControl();

    const options = fieldOptions(field, label);

    const selected = typeof value === 'string' ? value : '';

    return (
        <RadioGroup
            aria-labelledby={labelId}
            options={options}
            value={selected}
            onChange={(v) => onChange(name, v)}
            name={name}
            required={required ?? false}
            {...(disabled !== undefined ? { disabled } : {})}
        />
    );
}
