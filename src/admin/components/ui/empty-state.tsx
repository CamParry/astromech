import React from 'react';

type EmptyStateProps = {
    title: string;
    description?: string;
    action?: React.ReactNode;
    icon?: React.ReactNode;
};

export function EmptyState({ title, description, action, icon }: EmptyStateProps): React.ReactElement {
    return (
        <div className="am-empty-state">
            {icon !== undefined && <div className="am-empty-state-icon">{icon}</div>}
            <p className="am-empty-state-title">{title}</p>
            {description !== undefined && <p className="am-empty-state-description">{description}</p>}
            {action !== undefined && <div className="am-empty-state-action">{action}</div>}
        </div>
    );
}

export type { EmptyStateProps };
