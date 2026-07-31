import React from 'react';
import { FieldControlProvider } from './field-control-context';

export type FieldWrapperProps = {
    label: React.ReactNode;
    description?: React.ReactNode;
    required?: boolean;
    error?: string[] | undefined;
    onBlur?: React.FocusEventHandler<HTMLDivElement>;
    children: React.ReactNode;
};

export function FieldWrapper({
    label,
    description,
    required,
    error,
    onBlur,
    children,
}: FieldWrapperProps): React.ReactElement {
    const hasError = error !== undefined && error.length > 0;
    const errorId = React.useId();
    return (
        <div
            className="am-field"
            onBlur={onBlur}
            {...(hasError ? { 'data-invalid': '' } : {})}
        >
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
            {/*
             * Deliberately NOT a live region. An assertive one clips the name of
             * the field just tabbed to; a polite one appends the previous field's
             * error after the new field's name. The association that works is the
             * persistent `aria-invalid` + `aria-describedby` the control applies
             * from `FieldControlContext`; live-region announcement is reserved for
             * the submit-time summary toast.
             */}
            {hasError && (
                <p className="am-field-error" id={errorId}>
                    {error[0]}
                </p>
            )}
        </div>
    );
}
