import type { BaseFieldProps } from 'astromech';
import { ColorPicker } from '../ui/color-picker';

export function ColorField({ name, value, onChange, disabled }: BaseFieldProps) {
    const hex = typeof value === 'string' && value ? value : '#000000';
    return (
        <ColorPicker
            value={hex}
            onChange={(c) => onChange(name, c)}
            {...(disabled !== undefined ? { disabled } : {})}
        />
    );
}
