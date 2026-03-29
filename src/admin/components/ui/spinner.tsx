import React from 'react';
import { clsx } from 'clsx';

type SpinnerProps = { size?: 'sm' | 'md' | 'lg'; className?: string };
type SkeletonProps = { className?: string; style?: React.CSSProperties };

export function Spinner({ size = 'md', className }: SpinnerProps): React.ReactElement {
    const classes = clsx('am-spinner', `am-spinner-${size}`, className);
    return <span className={classes} aria-hidden="true" />;
}

export function Skeleton({ className, style }: SkeletonProps): React.ReactElement {
    const classes = clsx('am-skeleton', className);
    return <span className={classes} style={style} aria-hidden="true" />;
}

export type { SpinnerProps, SkeletonProps };
