import React from 'react';
import { Spinner } from './spinner.js';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = React.ComponentProps<'button'> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
    icon?: React.ReactNode;
};

export function Button({
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
        <button className={classes} disabled={disabled ?? loading} {...props}>
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
