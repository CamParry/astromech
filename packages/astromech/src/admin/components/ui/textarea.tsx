import { clsx } from 'clsx';
import React from 'react';
import { useFieldControl } from '@/admin/components/fields/field-control-context';

type TextareaProps = React.ComponentProps<'textarea'> & {
    error?: string;
    label?: string;
    hint?: string;
};

export function Textarea({
    error,
    label,
    hint,
    className,
    id,
    ...props
}: TextareaProps): React.ReactElement {
    const { hasError, ariaProps } = useFieldControl();
    const textareaClass = clsx(
        'am-textarea',
        (error !== undefined || hasError) && 'am-textarea-error',
        className
    );
    const textareaEl = (
        <textarea id={id} className={textareaClass} {...ariaProps} {...props} />
    );

    if (label !== undefined || error !== undefined || hint !== undefined) {
        return (
            <div className="am-field">
                {label !== undefined && (
                    <label className="am-field-label" htmlFor={id}>
                        {label}
                    </label>
                )}
                {textareaEl}
                {error !== undefined && <p className="am-field-error">{error}</p>}
                {hint !== undefined && error === undefined && (
                    <p className="am-field-hint">{hint}</p>
                )}
            </div>
        );
    }

    return textareaEl;
}

export type { TextareaProps };
