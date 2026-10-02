import type { BaseFieldProps } from 'astromech';
import { Input } from '../ui/input';
import { useFieldControl } from './field-control-context';

export function NumberField({
    name,
    value,
    field,
    required,
    onChange,
    disabled,
}: BaseFieldProps) {
    const { controlId } = useFieldControl();
    return (
        <Input
            id={controlId}
            type="number"
            name={name}
            value={
                typeof value === 'number'
                    ? String(value)
                    : typeof value === 'string'
                      ? value
                      : ''
            }
            required={required}
            min={field.min}
            max={field.max}
            step={field.step || 1}
            disabled={disabled}
            onChange={(e) =>
                onChange(name, e.target.value === '' ? null : Number(e.target.value))
            }
        />
    );
}
