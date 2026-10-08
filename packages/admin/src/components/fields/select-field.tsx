import type { BaseFieldProps } from 'astromech';
import { useLabel } from '../../i18n/label-namespace';
import { Select } from '../ui/select';
import { useFieldControl } from './field-control-context';
import { fieldOptions } from './field-options';

export function SelectField({
    name,
    value,
    field,
    required,
    onChange,
    disabled,
}: BaseFieldProps) {
    const label = useLabel();
    const { controlId } = useFieldControl();

    const options = fieldOptions(field, label);

    return (
        <Select
            id={controlId}
            name={name}
            value={typeof value === 'string' ? value : ''}
            onValueChange={(v) => onChange(name, v ?? '')}
            options={options}
            placeholder="Select an option..."
            required={!!required}
            {...(disabled !== undefined ? { disabled } : {})}
        />
    );
}
