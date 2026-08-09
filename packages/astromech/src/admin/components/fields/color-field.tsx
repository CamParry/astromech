import type { BaseFieldProps } from '@/types/index';
import { ColorPicker } from '@/admin/components/ui/color-picker';

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
