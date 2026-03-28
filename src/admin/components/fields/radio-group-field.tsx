import React from 'react';
import type { BaseFieldProps, SelectOption } from '@/types/index.js';
import './radio-group-field.css';

export function RadioGroupField({ name, value, field, onChange }: BaseFieldProps) {
    const options: SelectOption[] =
        (field.options ?? []).map((opt) => {
            if (typeof opt === 'string') return { value: opt, label: opt };
            return opt;
        });

    const selected = typeof value === 'string' ? value : '';

    return (
        <div className="am-radio-group">
            {options.map((opt) => {
                const id = `${name}--${opt.value}`;
                return (
                    <label key={opt.value} className="am-radio" htmlFor={id}>
                        <input
                            id={id}
                            type="radio"
                            name={name}
                            value={opt.value}
                            checked={selected === opt.value}
                            onChange={() => onChange(name, opt.value)}
                            className="am-radio-input"
                        />
                        <span className="am-radio-label">{opt.label}</span>
                    </label>
                );
            })}
        </div>
    );
}
