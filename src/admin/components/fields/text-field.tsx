import type { BaseFieldProps } from '@/types/index.js';
import { formatValueForInput } from '@/utils/field-formatters';
import { Input } from '@/admin/components/ui/input';
import { FieldCount } from './field-count';

export function TextField({ name, value, field, required, onChange }: BaseFieldProps) {
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
                onChange={(e) => onChange(name, e.target.value)}
            />
            {field.count && <FieldCount value={stringValue} count={field.count} />}
        </>
    );
}
