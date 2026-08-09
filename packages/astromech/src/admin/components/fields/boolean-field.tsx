import type { BaseFieldProps } from '@/types/index';
import { Toggle } from '@/admin/components/ui/toggle';

export function BooleanField({ name, value, onChange, disabled }: BaseFieldProps) {
    const checked = value === true || value === 'true';
    return (
        <Toggle
            id={name}
            name={name}
            checked={checked}
            onChange={(c) => onChange(name, c)}
            {...(disabled !== undefined ? { disabled } : {})}
        />
    );
}
