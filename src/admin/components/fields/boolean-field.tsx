import { Switch } from '@base-ui/react/switch';
import type { BaseFieldProps } from '@/types/index.js';
import './boolean-field.css';

export function BooleanField({ name, value, onChange }: BaseFieldProps) {
    const checked = value === true || value === 'true';

    return (
        <Switch.Root
            className="am-switch"
            id={name}
            name={name}
            checked={checked}
            value="true"
            onCheckedChange={(c) => onChange(name, c)}
        >
            <Switch.Thumb className="am-switch-thumb" />
        </Switch.Root>
    );
}
