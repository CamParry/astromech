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
    const classes = ['am-panel', padding ? '' : 'am-panel-no-padding', className].filter(Boolean).join(' ');

    return (
        <div className={classes}>
            {(title !== undefined || description !== undefined) && (
                <div className="am-panel-header">
                    {title !== undefined && <h2 className="am-panel-title">{title}</h2>}
                    {description !== undefined && <p className="am-panel-description">{description}</p>}
                </div>
            )}
            <div className="am-panel-body">{children}</div>
            {footer !== undefined && <div className="am-panel-footer">{footer}</div>}
        </div>
    );
}

export type { PanelProps };
