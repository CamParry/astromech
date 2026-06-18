import { Input } from '@/admin/components/ui/input';
import type { BaseFieldProps } from '@/types/index.js';

export function DatetimeField({ name, value, required, onChange }: BaseFieldProps) {
    return (
        <Input
            type="datetime-local"
            name={name}
            value={typeof value === 'string' ? value : ''}
            required={required}
            onChange={(e) => onChange(name, e.target.value)}
        />
    );
}
