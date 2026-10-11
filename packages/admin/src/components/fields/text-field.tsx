import type { BaseFieldProps } from 'astromech';
import { Input } from '../ui/input';
import { useFieldControl } from './field-control-context';
import { FieldCount } from './field-count';

export function TextField({
    name,
    value,
    field,
    required,
    onChange,
    disabled,
}: BaseFieldProps) {
    const { controlId } = useFieldControl();
    const stringValue = value == null ? '' : String(value);

    return (
        <>
            <Input
                id={controlId}
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
