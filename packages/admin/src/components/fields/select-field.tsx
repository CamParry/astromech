import type { BaseFieldProps } from 'astromech';
import { useLabel } from '../../i18n/entry-namespace';
import { Select } from '../ui/select';
import { useFieldControl } from './field-control-context';

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

    const options: { value: string; label: string }[] =
        field.options?.map((opt) => {
            if (typeof opt === 'string') {
                return { value: opt, label: opt };
            }
            return { value: opt.value, label: label(opt.label, opt.value) };
        }) || [];

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
