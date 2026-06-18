import type { BaseFieldProps } from '@/types/index.js';
import { Textarea } from '@/admin/components/ui/textarea.js';
import { FieldCount } from './field-count';

export function TextareaField({
    name,
    value,
    field,
    required,
    onChange,
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
                onChange={(e) => onChange(name, e.target.value)}
            />
            {field.count && <FieldCount value={stringValue} count={field.count} />}
        </>
    );
}
