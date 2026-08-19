import type { BaseFieldProps } from '@/types/index';
import { Input } from '@/admin/components/ui/input';

export function DatetimeField({
    name,
    value,
    required,
    onChange,
    disabled,
}: BaseFieldProps) {
    return (
        <Input
            type="datetime-local"
            name={name}
            value={typeof value === 'string' ? value : ''}
            required={required}
            disabled={disabled}
            onChange={(e) => onChange(name, e.target.value)}
        />
    );
}
