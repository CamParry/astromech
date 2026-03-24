import React from 'react';
import type { BaseFieldProps } from '@/types/index.js';
import { Collapsible } from '@/admin/components/ui/collapsible';
import { FieldInput } from '@/admin/components/fields/field-input';
import './accordion-field.css';

export function AccordionField({ name, value, field, onChange }: BaseFieldProps) {
    const fields = field.fields ?? [];
    const groupValue =
        typeof value === 'object' && value !== null && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : {};

    function handleSubFieldChange(fieldName: string, fieldValue: unknown) {
        onChange(name, { ...groupValue, [fieldName]: fieldValue });
    }

    return (
        <Collapsible
            label={field.label ?? name}
            defaultOpen={field.collapsed !== true}
        >
            <div className="am-accordion-field__content">
                {fields.map((subField) => (
                    <div key={subField.name} className="am-accordion-field__item">
                        <label
                            className="am-accordion-field__label"
                            htmlFor={`${name}.${subField.name}`}
                        >
                            {subField.label ?? subField.name}
                            {subField.required === true && (
                                <span className="am-accordion-field__required">*</span>
                            )}
                        </label>
                        {subField.description !== undefined && (
                            <p className="am-accordion-field__description">
                                {subField.description}
                            </p>
                        )}
                        <FieldInput
                            field={subField}
                            value={groupValue[subField.name]}
                            name={`${name}.${subField.name}`}
                            onChange={handleSubFieldChange}
                        />
                    </div>
                ))}
            </div>
        </Collapsible>
    );
}
