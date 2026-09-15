import type { BaseFieldProps } from 'astromech';
import { Input } from '../ui/input';

export function SlugField({ name, value, required, onChange, disabled }: BaseFieldProps) {
    return (
        <Input
            type="text"
            name={name}
            value={typeof value === 'string' ? value : ''}
            required={required}
            pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
            onChange={(e) => onChange(name, e.target.value)}
            disabled={disabled}
        />
    );
}
