import React from 'react';
import type { BaseFieldProps } from '@/types/index.js';
import { FieldInput } from '@/admin/components/fields/field-input';
import './group-field.css';

export function GroupField({ name, value, field, onChange }: BaseFieldProps) {
    const fields = field.fields ?? [];
    const groupValue = (typeof value === 'object' && value !== null && !Array.isArray(value))
        ? value as Record<string, unknown>
        : {};

    function handleSubFieldChange(fieldName: string, fieldValue: unknown) {
        const newGroupValue = { ...groupValue, [fieldName]: fieldValue };
        onChange(name, newGroupValue);
    }

    return (
        <div className="am-group-field">
            {fields.map((subField) => (
                <div key={subField.name} className="am-group-field__item">
                    <label className="am-group-field__label" htmlFor={`${name}.${subField.name}`}>
                        {subField.label ?? subField.name}
                        {subField.required === true && <span className="am-group-field__required">*</span>}
                    </label>
                    {subField.description !== undefined && (
                        <p className="am-group-field__description">{subField.description}</p>
                    )}
                    <FieldInput
                        field={subField}
                        value={groupValue[subField.name]}
                        onChange={handleSubFieldChange}
                    />
                </div>
            ))}
        </div>
    );
}
