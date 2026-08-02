import { useState } from 'react';
import type { BaseFieldProps } from '@/types/index.js';
import { useFieldControl } from '@/admin/components/fields/field-control-context';
import './json-field.css';

export function JsonField({ name, value, required, onChange, disabled }: BaseFieldProps) {
    const { hasError, ariaProps } = useFieldControl();
    const initialJson =
        value !== undefined && value !== null ? JSON.stringify(value, null, 2) : '';

    const [raw, setRaw] = useState(initialJson);
    const [error, setError] = useState<string | null>(null);

    const handleBlur = () => {
        if (raw.trim() === '') {
            onChange(name, null);
            setError(null);
            return;
        }
        try {
            const parsed = JSON.parse(raw);
            setError(null);
            onChange(name, parsed);
        } catch {
            setError('Invalid JSON');
        }
    };

    const showLocalError = !hasError && error !== null;

    return (
        <div className="am-json-field">
            <textarea
                className={`am-json-field-textarea${error !== null ? ' am-json-field-textarea-error' : ''}`}
                name={name}
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                onBlur={handleBlur}
                required={required}
                rows={8}
                spellCheck={false}
                autoComplete="off"
                disabled={disabled}
                {...ariaProps}
                aria-invalid={hasError || error !== null || undefined}
            />
            {showLocalError && <p className="am-field-error">{error}</p>}
        </div>
    );
}
