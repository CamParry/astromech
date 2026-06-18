import React from 'react';
import { clsx } from 'clsx';

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
    const textareaClass = clsx('am-textarea', error && 'am-textarea-error', className);
    const textareaEl = <textarea id={id} className={textareaClass} {...props} />;

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
