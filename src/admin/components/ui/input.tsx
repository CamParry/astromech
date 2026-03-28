import React from 'react';
import { Field } from '@base-ui/react/field';

type InputProps = React.ComponentProps<'input'> & {
    error?: string;
    label?: string;
    hint?: string;
};

export function Input({ error, label, hint, className, id, ...props }: InputProps): React.ReactElement {
    const inputClass = ['am-input', error ? 'am-input-error' : '', className].filter(Boolean).join(' ');

    if (label !== undefined || error !== undefined || hint !== undefined) {
        return (
            <Field.Root invalid={error !== undefined} className="am-field">
                {label !== undefined && (
                    <Field.Label className="am-field-label" htmlFor={id}>
                        {label}
                    </Field.Label>
                )}
                <Field.Control
                    id={id}
                    className={inputClass}
                    render={<input />}
                    {...props}
                />
                {error !== undefined && (
                    <Field.Error className="am-field-error">
                        {error}
                    </Field.Error>
                )}
                {hint !== undefined && error === undefined && (
                    <Field.Description className="am-field-hint">
                        {hint}
                    </Field.Description>
                )}
            </Field.Root>
        );
    }

    return <input id={id} className={inputClass} {...props} />;
}

export type { InputProps };
