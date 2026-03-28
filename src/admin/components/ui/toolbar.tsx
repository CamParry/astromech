import React from 'react';

type ToolbarProps = {
    children: React.ReactNode;
    className?: string;
};

export function Toolbar({ children, className }: ToolbarProps): React.ReactElement {
    const classes = ['am-toolbar', className].filter(Boolean).join(' ');
    return <div className={classes}>{children}</div>;
}

export function ToolbarStart({ children }: { children: React.ReactNode }): React.ReactElement {
    return <div className="am-toolbar-group am-toolbar-start">{children}</div>;
}

export function ToolbarEnd({ children }: { children: React.ReactNode }): React.ReactElement {
    return <div className="am-toolbar-group am-toolbar-end">{children}</div>;
}

