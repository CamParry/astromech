import React from 'react';
import type { BaseFieldProps, SelectOption } from '@/types/index.js';
import { Checkbox } from '@/admin/components/ui/checkbox';
import './checkbox-group-field.css';

export function CheckboxGroupField({ name, value, field, onChange }: BaseFieldProps) {
    const options: SelectOption[] =
        (field.options ?? []).map((opt) => {
            if (typeof opt === 'string') return { value: opt, label: opt };
            return opt;
        });

    const checked: string[] = Array.isArray(value) ? (value as string[]) : [];

    function handleChange(optValue: string, isChecked: boolean) {
        const next = isChecked
            ? [...checked, optValue]
            : checked.filter((v) => v !== optValue);
        onChange(name, next);
    }

    return (
        <div className="am-checkbox-group">
            {options.map((opt) => (
                <Checkbox
                    key={opt.value}
                    id={`${name}--${opt.value}`}
                    label={opt.label}
                    checked={checked.includes(opt.value)}
                    onChange={(isChecked) => handleChange(opt.value, isChecked)}
                />
            ))}
        </div>
    );
}
