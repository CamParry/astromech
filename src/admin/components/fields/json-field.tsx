import React, { useState } from 'react';
import type { BaseFieldProps } from '@/types/index.js';
import './json-field.css';

export function JsonField({ name, value, field, required, onChange }: BaseFieldProps) {
    const initialJson = value !== undefined && value !== null
        ? JSON.stringify(value, null, 2)
        : '';

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

    return (
        <div className="am-json-field">
            <textarea
                className={`am-json-field__textarea${error !== null ? ' am-json-field__textarea--error' : ''}`}
                name={name}
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                onBlur={handleBlur}
                required={required}
                rows={8}
                spellCheck={false}
                autoComplete="off"
            />
            {error !== null && <span className="am-json-field__error">{error}</span>}
        </div>
    );
}
