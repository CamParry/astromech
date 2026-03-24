import { Input } from '@/admin/components/ui/input';
import type { BaseFieldProps } from '@/types/index.js';

export function DateField({ name, value, required, onChange }: BaseFieldProps) {
    return (
        <Input
            type="date"
            name={name}
            value={typeof value === 'string' ? value : ''}
            required={required}
            onChange={(e) => onChange(name, e.target.value)}
        />
    );
}
