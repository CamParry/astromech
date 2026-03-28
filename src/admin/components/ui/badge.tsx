import React from 'react';

type BadgeVariant =
    | 'default'
    | 'neutral'
    | 'primary'
    | 'success'
    | 'warning'
    | 'danger'
    | 'draft'
    | 'published'
    | 'scheduled'
    | 'trashed';

type BadgeProps = {
    variant?: BadgeVariant;
    children: React.ReactNode;
};

export function Badge({ variant = 'default', children }: BadgeProps): React.ReactElement {
    return <span className={`am-badge am-badge-${variant}`}>{children}</span>;
}

export type { BadgeProps, BadgeVariant };
