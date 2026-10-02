import { clsx } from 'clsx';
import React, { useId } from 'react';

type PanelProps = {
    children: React.ReactNode;
    title?: string;
    description?: string;
    footer?: React.ReactNode;
    className?: string;
    padding?: boolean;
    /** A role for the panel, such as `group`; the title names it and the description describes it. */
    role?: React.AriaRole;
};

export function Panel({
    children,
    title,
    description,
    footer,
    className,
    padding = true,
    role,
}: PanelProps): React.ReactElement {
    const id = useId();
    const titleId = `${id}-title`;
    const descriptionId = `${id}-description`;
    const classes = clsx('am-panel', !padding && 'am-panel-no-padding', className);

    return (
        <div
            className={classes}
            {...(role !== undefined && {
                role,
                ...(title !== undefined && { 'aria-labelledby': titleId }),
                ...(description !== undefined && { 'aria-describedby': descriptionId }),
            })}
        >
            {(title !== undefined || description !== undefined) && (
                <div className="am-panel-header">
                    {title !== undefined && (
                        <h2 id={titleId} className="am-panel-title">
                            {title}
                        </h2>
                    )}
                    {description !== undefined && (
                        <p id={descriptionId} className="am-panel-description">
                            {description}
                        </p>
                    )}
                </div>
            )}
            <div className="am-panel-body">{children}</div>
            {footer !== undefined && <div className="am-panel-footer">{footer}</div>}
        </div>
    );
}

export type { PanelProps };
