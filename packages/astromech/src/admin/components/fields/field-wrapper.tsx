import React from 'react';
import { FieldControlProvider } from './field-control-context';

export type FieldWrapperProps = {
    label: React.ReactNode;
    description?: React.ReactNode;
    required?: boolean;
    error?: string[] | undefined;
    children: React.ReactNode;
};

export function FieldWrapper({
    label,
    description,
    required,
    error,
    children,
}: FieldWrapperProps): React.ReactElement {
    const hasError = error !== undefined && error.length > 0;
    const errorId = React.useId();
    return (
        <div className="am-field" {...(hasError ? { 'data-invalid': '' } : {})}>
            <label className="am-field-label">
                {label}
                {required === true && <span className="am-field-required">*</span>}
            </label>
            {description !== undefined && <p className="am-field-hint">{description}</p>}
            <FieldControlProvider
                value={{ hasError, errorId: hasError ? errorId : undefined }}
            >
                {children}
            </FieldControlProvider>
            {hasError && (
                <p className="am-field-error" id={errorId} role="alert">
                    {error.join(', ')}
                </p>
            )}
        </div>
    );
}
