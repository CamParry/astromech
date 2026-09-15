import type { BaseFieldProps } from 'astromech';
import { formatValueForInput } from '../../utilities/formatters';
import { Input } from '../ui/input';
import { FieldCount } from './field-count';

export function TextField({
    name,
    value,
    field,
    required,
    onChange,
    disabled,
}: BaseFieldProps) {
    const stringValue =
        typeof value === 'string' ? value : formatValueForInput(value, 'text');

    return (
        <>
            <Input
                type="text"
                name={name}
                value={stringValue}
                required={required}
                maxLength={field.maxLength}
                disabled={disabled}
                onChange={(e) => onChange(name, e.target.value)}
            />
            {field.count && <FieldCount value={stringValue} count={field.count} />}
        </>
    );
}
