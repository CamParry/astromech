import React from 'react';
import type { FieldDefinition } from '@/types/index.js';
import { Input } from '@/admin/components/ui/input';
import { getFieldComponent } from '@/admin/definitions/field-registry.js';
import { useLabel } from '@/admin/i18n/entry-namespace.js';
import { hasPluginFieldType, PluginField } from './plugin-field';
import { FieldPathProvider } from './field-context';

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
    const label = useLabel();

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

    // A container-less group is invisible chrome — pure data nesting. It renders
    // its sub-fields inline with no label or box; pair it with a `section` for a
    // heading/surface.
    if (field.type === 'group' && field.container === false) {
        return <FieldPathProvider path={commonProps.name}>{control}</FieldPathProvider>;
    }

    return (
        <div className="am-field">
            <label className="am-field-label">
                {label(field.label, field.name)}
                {required && <span className="am-field-required">*</span>}
            </label>
            {field.description !== undefined && (
                <p className="am-field-hint">{label(field.description, field.name)}</p>
            )}
            <FieldPathProvider path={commonProps.name}>{control}</FieldPathProvider>
        </div>
    );
}
