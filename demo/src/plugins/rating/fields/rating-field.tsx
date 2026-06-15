import React from 'react';
import type { BaseFieldProps, FieldDefinition } from 'astromech';

export default function RatingField({
    name,
    value,
    onChange,
    disabled,
}: BaseFieldProps): React.ReactElement {
    const current = typeof value === 'number' ? value : 0;
    return (
        <div data-rating-field style={{ display: 'flex', gap: '0.25rem' }}>
            {[1, 2, 3, 4, 5].map((star) => (
                <button
                    key={star}
                    type="button"
                    disabled={disabled}
                    aria-label={`${star} of 5`}
                    onClick={() => onChange(name, star === current ? 0 : star)}
                    style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '1.25rem',
                        padding: 0,
                        color: star <= current ? '#f59e0b' : '#d1d5db',
                    }}
                >
                    ★
                </button>
            ))}
        </div>
    );
}

export function validate(value: unknown, _field: FieldDefinition): string | undefined {
    if (typeof value === 'number' && (value < 0 || value > 5)) {
        return 'Rating must be between 0 and 5';
    }
    return undefined;
}
