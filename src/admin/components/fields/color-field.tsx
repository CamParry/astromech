import type { BaseFieldProps } from '@/types/index.js';
import { ColorPicker } from '@/admin/components/ui/color-picker.js';

export function ColorField({ name, value, onChange }: BaseFieldProps) {
    const hex = typeof value === 'string' && value ? value : '#000000';
    return <ColorPicker value={hex} onChange={(c) => onChange(name, c)} />;
}
