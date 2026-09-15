import type { BaseFieldProps } from 'astromech';
import { Input } from '../ui/input';

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
