import type { BaseFieldProps } from '@/types/index';
import { Textarea } from '@/admin/components/ui/textarea';
import { FieldCount } from './field-count';

export function TextareaField({
    name,
    value,
    field,
    required,
    onChange,
    disabled,
}: BaseFieldProps) {
    const stringValue = typeof value === 'string' ? value : '';

    return (
        <>
            <Textarea
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
