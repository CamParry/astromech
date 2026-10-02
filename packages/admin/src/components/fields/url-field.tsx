import type { BaseFieldProps } from 'astromech';
import { Input } from '../ui/input';
import { useFieldControl } from './field-control-context';

export function UrlField({ name, value, required, onChange, disabled }: BaseFieldProps) {
    const { controlId } = useFieldControl();
    return (
        <Input
            id={controlId}
            type="url"
            name={name}
            value={typeof value === 'string' ? value : ''}
            required={required}
            disabled={disabled}
            onChange={(e) => onChange(name, e.target.value)}
        />
    );
}
