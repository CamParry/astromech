import type { BaseFieldProps } from 'astromech';
import { Textarea } from '../ui/textarea';
import { useFieldControl } from './field-control-context';
import { FieldCount } from './field-count';

export function TextareaField({
    name,
    value,
    field,
    required,
    onChange,
    disabled,
}: BaseFieldProps) {
    const { controlId } = useFieldControl();
    const stringValue = typeof value === 'string' ? value : '';

    return (
        <>
            <Textarea
                id={controlId}
                name={name}
                value={stringValue}
                required={required}
                rows={5}
                maxLength={field.maxLength}
                disabled={disabled}
                onChange={(e) => onChange(name, e.target.value)}
            />
            {field.count && <FieldCount value={stringValue} count={field.count} />}
        </>
    );
}
