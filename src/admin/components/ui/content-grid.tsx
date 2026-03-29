import React from 'react';
import { clsx } from 'clsx';

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
        <div className={clsx('am-content-grid', className)} style={style}>
            {children}
        </div>
    );
}

function Item({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}): React.ReactElement {
    return <div className={clsx('am-content-grid-item', className)}>{children}</div>;
}

export const ContentGrid = { Root, Item };
