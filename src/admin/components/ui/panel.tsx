import React from 'react';

type PanelProps = {
    children: React.ReactNode;
    title?: string;
    description?: string;
    footer?: React.ReactNode;
    className?: string;
    padding?: boolean;
};

export function Panel({ children, title, description, footer, className, padding = true }: PanelProps): React.ReactElement {
    const classes = ['am-panel', padding ? '' : 'am-panel--no-padding', className].filter(Boolean).join(' ');

    return (
        <div className={classes}>
            {(title !== undefined || description !== undefined) && (
                <div className="am-panel__header">
                    {title !== undefined && <h2 className="am-panel__title">{title}</h2>}
                    {description !== undefined && <p className="am-panel__description">{description}</p>}
                </div>
            )}
            <div className="am-panel__body">{children}</div>
            {footer !== undefined && <div className="am-panel__footer">{footer}</div>}
        </div>
    );
}

export type { PanelProps };
