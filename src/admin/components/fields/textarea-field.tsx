import type { BaseFieldProps } from '@/types/index.js';
import './textarea-field.css';

export function TextareaField({ name, value, field, required, onChange }: BaseFieldProps) {
    return (
        <textarea
            name={name}
            value={typeof value === 'string' ? value : ''}
            required={required}
            rows={5}
            className="am-textarea-field"
            onChange={(e) => onChange(name, e.target.value)}
        />
    );
}
