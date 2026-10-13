import React from 'react';
import { Spinner } from './spinner';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = React.ComponentProps<'button'> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
    icon?: React.ReactNode;
};

/**
 * The admin's button. It is `type="button"` unless the caller passes
 * `type="submit"`, so a `Button` inside a `<form>` never submits it by
 * accident when Enter is pressed in a field.
 */
export function Button({
    type = 'button',
    variant = 'primary',
    size = 'md',
    loading = false,
    icon,
    children,
    disabled,
    className,
    ...props
}: ButtonProps): React.ReactElement {
    const iconOnly = icon !== undefined && children === undefined;
    const classes = [
        'am-btn',
        `am-btn-${variant}`,
        `am-btn-${size}`,
        iconOnly ? 'am-btn-icon' : '',
        className ?? '',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <button type={type} className={classes} disabled={disabled ?? loading} {...props}>
            {loading ? (
                <Spinner size="sm" />
            ) : icon !== undefined ? (
                <span className="am-btn-icon">{icon}</span>
            ) : null}
            {children}
        </button>
    );
}

export type { ButtonProps, ButtonVariant, ButtonSize };
