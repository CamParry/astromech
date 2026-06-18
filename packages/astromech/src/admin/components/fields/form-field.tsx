import React from 'react';
import type { FieldDefinition } from '@/types/index.js';
import { Input } from '@/admin/components/ui/input';
import { getFieldComponent } from '@/admin/definitions/field-registry.js';
import { useLabel } from '@/admin/i18n/entry-namespace.js';
import { hasPluginFieldType, PluginField } from './plugin-field';
import { FieldPathProvider } from './field-context';
import { FieldWrapper } from './field-wrapper';
import { useFieldError } from './field-errors-context';

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

    const error = useFieldError(field.name);

    // A container-less group is invisible chrome — pure data nesting. It renders
    // its sub-fields inline with no label or box; pair it with a `section` for a
    // heading/surface.
    if (field.type === 'group' && field.container === false) {
        return <FieldPathProvider path={commonProps.name}>{control}</FieldPathProvider>;
    }

    return (
        <FieldWrapper
            label={label(field.label, field.name)}
            description={
                field.description !== undefined
                    ? label(field.description, field.name)
                    : undefined
            }
            required={required}
            error={error}
        >
            <FieldPathProvider path={commonProps.name}>{control}</FieldPathProvider>
        </FieldWrapper>
    );
}
