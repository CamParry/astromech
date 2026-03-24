import type { BaseFieldProps } from '@/types/index.js';
import { formatValueForInput } from '@/utils/field-formatters';
import { Input } from '@/admin/components/ui/input';
import './text-field.css';

export function TextField({ name, value, required, onChange }: BaseFieldProps) {
    const stringValue = formatValueForInput(value, 'text');

    return (
        <Input
            type="text"
            name={name}
            value={typeof value === 'string' ? value : stringValue}
            required={required}
            onChange={(e) => onChange(name, e.target.value)}
        />
    );
}
