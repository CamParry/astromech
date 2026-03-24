import React from 'react';
import type { BaseFieldProps } from '@/types/index.js';
import { Slider } from '@/admin/components/ui/slider';
import './range-field.css';

export function RangeField({ name, value, field, onChange }: BaseFieldProps) {
    const numValue = typeof value === 'number' ? value : (field.min ?? 0);
    const min = field.min ?? 0;
    const max = field.max ?? 100;
    const step = field.step ?? 1;

    return (
        <div className="am-range-field">
            <div className="am-range-field__header">
                <span className="am-range-field__value">{numValue}</span>
            </div>
            <Slider
                value={numValue}
                min={min}
                max={max}
                step={step}
                aria-label={field.label ?? name}
                onValueChange={(v) => {
                    const next = Array.isArray(v) ? v[0] : v;
                    if (next !== undefined) onChange(name, next);
                }}
            />
            <input type="hidden" name={name} value={numValue} />
        </div>
    );
}
