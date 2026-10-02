import type { BaseFieldProps } from 'astromech';
import { Toggle } from '../ui/toggle';
import { useFieldControl } from './field-control-context';

export function BooleanField({ name, value, onChange, disabled }: BaseFieldProps) {
    const { labelId } = useFieldControl();
    const checked = value === true || value === 'true';
    return (
        <Toggle
            aria-labelledby={labelId}
            name={name}
            checked={checked}
            onChange={(c) => onChange(name, c)}
            {...(disabled !== undefined ? { disabled } : {})}
        />
    );
}
