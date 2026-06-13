import React from 'react';
import type { FieldDefinition } from '@/types/index.js';
import { Input } from '@/admin/components/ui/input';
import { getFieldComponent } from '@/admin/definitions/field-registry.js';
import { hasPluginFieldType, PluginField } from './plugin-field';

export type FormFieldProps = {
    field: FieldDefinition;
    value: unknown;
    name?: string;
    onChange: (name: string, value: unknown) => void;
    disabled?: boolean;
};

export function FormField({
    field,
    value,
    name,
    onChange,
    disabled,
}: FormFieldProps): React.ReactElement {
    const required = field.required ?? false;

    const commonProps = {
        name: name ?? field.name,
        value,
        field,
        required,
        onChange,
        ...(disabled !== undefined ? { disabled } : {}),
    };

    const Registered = getFieldComponent(field.type);
    const control = Registered ? (
        <Registered {...commonProps} />
    ) : hasPluginFieldType(field.type) ? (
        <PluginField {...commonProps} />
    ) : (
        <Input
            type="text"
            name={field.name}
            defaultValue={typeof value === 'string' ? value : ''}
            required={required}
            onChange={(e) => onChange(field.name, e.target.value)}
        />
    );

    return (
        <div className="am-field">
            <label className="am-field-label">
                {field.label ?? field.name}
                {required && <span className="am-field-required">*</span>}
            </label>
            {field.description !== undefined && (
                <p className="am-field-hint">{field.description}</p>
            )}
            {control}
        </div>
    );
}
