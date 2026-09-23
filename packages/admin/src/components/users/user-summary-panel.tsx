/**
 * The user edit page's summary panel: who the user is, when they joined and
 * when their account was last updated.
 */

import type { User } from 'astromech';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatDatetime } from '../../utilities/dates';
import { Avatar } from '../ui/avatar';
import { Panel } from '../ui/panel';

export function UserSummaryPanel({ user }: { user: User }): React.ReactElement {
    const { t } = useTranslation();
    return (
        <Panel title={t('users.metadataPanel')}>
            <div className="am-user-summary">
                <Avatar name={user.name} src={user.image} size="md" />
                <div>
                    <div className="am-user-summary-name">{user.name}</div>
                    <div className="am-user-summary-email">{user.email}</div>
                </div>
            </div>
            <dl className="am-meta">
                <div>
                    <dt className="am-meta-label">{t('users.joinedLabel')}</dt>
                    <dd className="am-meta-value">{formatDatetime(user.createdAt)}</dd>
                </div>
                <div>
                    <dt className="am-meta-label">{t('users.lastUpdatedLabel')}</dt>
                    <dd className="am-meta-value">{formatDatetime(user.updatedAt)}</dd>
                </div>
            </dl>
        </Panel>
    );
}
