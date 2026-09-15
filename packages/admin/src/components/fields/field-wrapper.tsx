import React from 'react';
import { FieldControlProvider } from './field-control-context';

export type FieldWrapperProps = {
    label: React.ReactNode;
    description?: React.ReactNode;
    required?: boolean;
    error?: string[] | undefined;
    /** Advisory message, shown only when the field has no error. */
    warning?: string[] | undefined;
    onBlur?: React.FocusEventHandler<HTMLDivElement>;
    children: React.ReactNode;
};

export function FieldWrapper({
    label,
    description,
    required,
    error,
    warning,
    onBlur,
    children,
}: FieldWrapperProps): React.ReactElement {
    const hasError = error !== undefined && error.length > 0;
    // An error supersedes a warning: two messages under one field leave the
    // author guessing which one has to be acted on.
    const hasWarning = !hasError && warning !== undefined && warning.length > 0;
    // One id serves whichever message renders, so `aria-describedby` resolves
    // either way.
    const messageId = React.useId();
    return (
        <div
            className="am-field"
            onBlur={onBlur}
            {...(hasError ? { 'data-invalid': '' } : {})}
            {...(hasWarning ? { 'data-warning': '' } : {})}
        >
            <label className="am-field-label">
                {label}
                {required === true && <span className="am-field-required">*</span>}
            </label>
            {description !== undefined && <p className="am-field-hint">{description}</p>}
            <FieldControlProvider
                value={{
                    hasError,
                    hasWarning,
                    errorId: hasError || hasWarning ? messageId : undefined,
                }}
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
                <p className="am-field-error" id={messageId}>
                    {error[0]}
                </p>
            )}
            {hasWarning && (
                <p className="am-field-warning" id={messageId}>
                    {warning[0]}
                </p>
            )}
        </div>
    );
}
