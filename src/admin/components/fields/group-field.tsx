import React from 'react';
import type { BaseFieldProps } from '@/types/index.js';
import { FormField } from '@/admin/components/fields/form-field';
import './group-field.css';

export function GroupField({ name, value, field, onChange }: BaseFieldProps) {
    const fields = field.fields ?? [];
    const groupValue =
        typeof value === 'object' && value !== null && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : {};

    function handleSubFieldChange(fieldName: string, fieldValue: unknown) {
        const newGroupValue = { ...groupValue, [fieldName]: fieldValue };
        onChange(name, newGroupValue);
    }

    return (
        <div className="am-group-field">
            {fields.map((subField) => (
                <div key={subField.name} className="am-group-field-item">
                    <label
                        className="am-group-field-label"
                        htmlFor={`${name}.${subField.name}`}
                    >
                        {subField.label ?? subField.name}
                        {subField.required === true && (
                            <span className="am-group-field-required">*</span>
                        )}
                    </label>
                    {subField.description !== undefined && (
                        <p className="am-group-field-description">
                            {subField.description}
                        </p>
                    )}
                    <FormField
                        field={subField}
                        value={groupValue[subField.name]}
                        onChange={handleSubFieldChange}
                    />
                </div>
            ))}
        </div>
    );
}
