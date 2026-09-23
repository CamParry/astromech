import type { BaseFieldProps } from 'astromech';
import React from 'react';
import { MAX_RATING, ratingError } from '../../fields/rating';

export default function RatingField({
    name,
    value,
    onChange,
    disabled,
}: BaseFieldProps): React.ReactElement {
    const current = typeof value === 'number' ? value : 0;
    return (
        <div data-rating-field style={{ display: 'flex', gap: '0.25rem' }}>
            {Array.from({ length: MAX_RATING }, (_, i) => i + 1).map((star) => (
                <button
                    key={star}
                    type="button"
                    disabled={disabled}
                    aria-label={`${star} of ${MAX_RATING}`}
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

/** The inline check the admin runs as the value changes; the server runs the same one. */
export function validate(value: unknown): string | undefined {
    return ratingError(value);
}
