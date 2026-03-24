import React from 'react';

type ToolbarProps = {
    children: React.ReactNode;
    className?: string;
};

export function Toolbar({ children, className }: ToolbarProps): React.ReactElement {
    const classes = ['am-toolbar', className].filter(Boolean).join(' ');
    return <div className={classes}>{children}</div>;
}

export function ToolbarLeft({ children }: { children: React.ReactNode }): React.ReactElement {
    return <div className="am-toolbar__left">{children}</div>;
}

export function ToolbarRight({ children }: { children: React.ReactNode }): React.ReactElement {
    return <div className="am-toolbar__right">{children}</div>;
}

