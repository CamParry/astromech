import type { BaseFieldProps } from 'astromech';
import { useLabel } from '../../i18n/label-namespace';
import { CheckboxGroup } from '../ui/checkbox-group';
import { useFieldControl } from './field-control-context';
import { fieldOptions } from './field-options';

export function CheckboxGroupField({
    name,
    value,
    field,
    onChange,
    disabled,
}: BaseFieldProps) {
    const label = useLabel();
    const { labelId } = useFieldControl();

    const options = fieldOptions(field, label);

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
