import type { BaseFieldProps } from '@/types/index.js';
import { Input } from '@/admin/components/ui/input';

export function NumberField({ name, value, field, required, onChange }: BaseFieldProps) {
    return (
        <Input
            type="number"
            name={name}
            value={typeof value === 'number' ? String(value) : typeof value === 'string' ? value : ''}
            required={required}
            min={field.min}
            max={field.max}
            step={field.step || 1}
            onChange={(e) => onChange(name, e.target.value === '' ? null : Number(e.target.value))}
        />
    );
}
