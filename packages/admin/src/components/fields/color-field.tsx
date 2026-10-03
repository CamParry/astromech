import type { BaseFieldProps } from 'astromech';
import { ColorPicker } from '../ui/color-picker';
import { useFieldControl } from './field-control-context';

export function ColorField({ name, value, onChange, disabled }: BaseFieldProps) {
    const { controlId, labelId } = useFieldControl();
    const hex = typeof value === 'string' && value ? value : '#000000';
    return (
        <ColorPicker
            id={controlId}
            aria-labelledby={labelId}
            value={hex}
            onChange={(c) => onChange(name, c)}
            {...(disabled !== undefined ? { disabled } : {})}
        />
    );
}
