import type { BaseFieldProps } from '@/types/index.js';
import { Textarea } from '@/admin/components/ui/textarea.js';

export function TextareaField({ name, value, required, onChange }: BaseFieldProps) {
    return (
        <Textarea
            name={name}
            value={typeof value === 'string' ? value : ''}
            required={required}
            rows={5}
            onChange={(e) => onChange(name, e.target.value)}
        />
    );
}
