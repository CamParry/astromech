import React from 'react';

type RootProps = {
    children: React.ReactNode;
    className?: string;
    minItemWidth?: string;
};

function Root({ children, className, minItemWidth }: RootProps): React.ReactElement {
    const style = minItemWidth
        ? ({ '--am-content-grid-min': minItemWidth } as React.CSSProperties)
        : undefined;
    return (
        <div
            className={['am-content-grid', className].filter(Boolean).join(' ')}
            style={style}
        >
            {children}
        </div>
    );
}

function Item({ children, className }: { children: React.ReactNode; className?: string }): React.ReactElement {
    return (
        <div className={['am-content-grid__item', className].filter(Boolean).join(' ')}>
            {children}
        </div>
    );
}

export const ContentGrid = { Root, Item };
