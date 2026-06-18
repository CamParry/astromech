import type { BaseFieldProps } from '@/types/index.js';
import { Input } from '@/admin/components/ui/input';

export function UrlField({ name, value, required, onChange, disabled }: BaseFieldProps) {
    return (
        <Input
            type="url"
            name={name}
            value={typeof value === 'string' ? value : ''}
            required={required}
            disabled={disabled}
            onChange={(e) => onChange(name, e.target.value)}
        />
    );
}
