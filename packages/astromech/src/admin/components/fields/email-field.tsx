import type { BaseFieldProps } from '@/types/index';
import { Input } from '@/admin/components/ui/input';

export function EmailField({
    name,
    value,
    required,
    onChange,
    disabled,
}: BaseFieldProps) {
    return (
        <Input
            type="email"
            name={name}
            value={typeof value === 'string' ? value : ''}
            required={required}
            disabled={disabled}
            onChange={(e) => onChange(name, e.target.value)}
        />
    );
}
