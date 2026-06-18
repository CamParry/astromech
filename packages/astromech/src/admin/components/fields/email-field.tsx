import type { BaseFieldProps } from '@/types/index.js';
import { Input } from '@/admin/components/ui/input';

export function EmailField({ name, value, required, onChange }: BaseFieldProps) {
    return (
        <Input
            type="email"
            name={name}
            value={typeof value === 'string' ? value : ''}
            required={required}
            onChange={(e) => onChange(name, e.target.value)}
        />
    );
}
