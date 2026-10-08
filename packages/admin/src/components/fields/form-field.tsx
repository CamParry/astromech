import type { BaseFieldProps, DataField } from 'astromech';
import React from 'react';
import { useLabel } from '../../i18n/label-namespace';
import { getFieldComponent, getFieldOptions } from '../../rendering/field-registry';
import { Input } from '../ui/input';
import { FieldPathProvider } from './field-context';
import { useFieldControl } from './field-control-context';
import { useFieldError, useFieldWarning } from './field-errors-context';
import { useFieldValidationHandlers } from './field-validation-context';
import { FieldWrapper } from './field-wrapper';
import { hasPluginFieldType, PluginField } from './plugin-field';

export type FormFieldProps = {
    field: DataField;
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
    const { onFieldChange, onFieldBlur } = useFieldValidationHandlers();

    // The FULL path (`blocks[6f1e2a].heading`), the only place it is known — a
    // container drops it when bubbling the change up to its own onChange.
    const path = name ?? field.name;

    // A nested change marks BOTH the nested field and each enclosing container
    // dirty, since every level's FormField wraps the one below in turn. Harmless:
    // a container's own rules are item counts, which the author did just change.
    const handleChange = (changedName: string, changedValue: unknown): void => {
        onFieldChange(path);
        onChange(changedName, changedValue);
    };

    const commonProps = {
        name: path,
        value,
        field,
        required,
        onChange: handleChange,
        ...(disabled !== undefined ? { disabled } : {}),
    };

    const Registered = getFieldComponent(field.type);
    const isPlugin = Registered === undefined && hasPluginFieldType(field.type);
    const control = Registered ? (
        <Registered {...commonProps} />
    ) : isPlugin ? (
        <PluginField {...commonProps} />
    ) : (
        <UnknownField {...commonProps} />
    );
    // A plugin's control is its own, so its label names it through `labelId`.
    const labelElement = isPlugin ? 'span' : getFieldOptions(field.type).labelElement;

    // Errors are keyed by the FULL field path (`blocks[6f1e2a].heading`), not the
    // bare field name — a nested field keyed on `field.name` would look up
    // `heading` and never find the error the server produced. At the top level
    // `commonProps.name` falls back to `field.name`, so the two agree there.
    const error = useFieldError(path);
    const warning = useFieldWarning(path);

    // An unboxed group draws nothing itself — pure data nesting. It renders
    // its sub-fields inline with no label or box; wrap it in an unnamed group
    // for a heading and surface. No wrapper here means no blur reporter
    // either — its children each carry their own.
    if (field.type === 'group' && field.boxed === false) {
        return <FieldPathProvider path={path}>{control}</FieldPathProvider>;
    }

    return (
        <FieldWrapper
            label={label(field.label, field.name)}
            {...(labelElement !== undefined && { labelElement })}
            description={
                field.description !== undefined
                    ? label(field.description, field.name)
                    : undefined
            }
            required={required}
            error={error}
            warning={warning}
            // React's onBlur bubbles (it is focusout), so without the stop,
            // focus leaving a nested field would report every enclosing
            // container too. The innermost wrapper owns the event.
            onBlur={(event) => {
                event.stopPropagation();
                onFieldBlur(path);
            }}
        >
            <FieldPathProvider path={path}>{control}</FieldPathProvider>
        </FieldWrapper>
    );
}

/** A field of a type nothing registered: a plain text input under its bare name. */
function UnknownField({
    field,
    value,
    required,
    onChange,
}: BaseFieldProps): React.ReactElement {
    const { controlId } = useFieldControl();
    return (
        <Input
            id={controlId}
            type="text"
            name={field.name}
            defaultValue={typeof value === 'string' ? value : ''}
            required={required}
            onChange={(e) => onChange(field.name, e.target.value)}
        />
    );
}
