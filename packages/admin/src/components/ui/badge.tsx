import type { EntryStatus } from 'astromech';
import React from 'react';

type BadgeVariant =
    | 'default'
    | 'primary'
    | 'success'
    | 'warning'
    | 'danger'
    | EntryStatus
    | 'trashed';

type BadgeProps = {
    variant?: BadgeVariant;
    children: React.ReactNode;
};

export function Badge({ variant = 'default', children }: BadgeProps): React.ReactElement {
    return <span className={`am-badge am-badge-${variant}`}>{children}</span>;
}

export type { BadgeProps, BadgeVariant };
