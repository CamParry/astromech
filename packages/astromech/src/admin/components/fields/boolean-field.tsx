import type { BaseFieldProps } from '@/types/index.js';
import { Toggle } from '@/admin/components/ui/toggle.js';

export function BooleanField({ name, value, onChange }: BaseFieldProps) {
    const checked = value === true || value === 'true';
    return (
        <Toggle
            id={name}
            name={name}
            checked={checked}
            onChange={(c) => onChange(name, c)}
        />
    );
}
