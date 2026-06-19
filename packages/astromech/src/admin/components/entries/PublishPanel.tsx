/**
 * PublishPanel — sidebar panel for managing entry publish status.
 *
 * Renders status select, datetime picker (when scheduled), and shows
 * the published date when the entry is live.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Panel, Select, Input } from '../ui/index.js';
import { formatDatetime } from '@/utilities/dates.js';
import type { EntryStatus } from '../../../types/index.js';

// ============================================================================
// Types
// ============================================================================

export type PublishPanelProps = {
    status: EntryStatus;
    publishAt: string;
    publishedAt?: Date | string | null | undefined;
    onStatusChange: (status: EntryStatus) => void;
    onPublishAtChange: (value: string) => void;
    readOnly?: boolean;
};

// ============================================================================
// Component
// ============================================================================

export function PublishPanel({
    status,
    publishAt,
    publishedAt,
    onStatusChange,
    onPublishAtChange,
    readOnly = false,
}: PublishPanelProps): React.ReactElement {
    const { t } = useTranslation();

    const statusOptions = [
        { value: 'unpublished' as EntryStatus, label: t('entries.unpublished') },
        { value: 'published' as EntryStatus, label: t('entries.published') },
        { value: 'scheduled' as EntryStatus, label: t('entries.scheduled') },
    ];

    const formattedPublishedAt = publishedAt != null ? formatDatetime(publishedAt) : null;

    return (
        <Panel title={t('entries.statusPanel')}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="am-field">
                    <label className="am-field-label">{t('entries.statusField')}</label>
                    <Select
                        value={status}
                        onValueChange={(v) =>
                            onStatusChange((v ?? 'unpublished') as EntryStatus)
                        }
                        options={statusOptions}
                        disabled={readOnly}
                    />
                </div>

                {status === 'scheduled' && (
                    <div className="am-field">
                        <label className="am-field-label" htmlFor="entry-publish-at">
                            {t('entries.publishAtField')}
                        </label>
                        <Input
                            id="entry-publish-at"
                            type="datetime-local"
                            value={publishAt}
                            onChange={(e) => onPublishAtChange(e.target.value)}
                            disabled={readOnly}
                        />
                    </div>
                )}

                {status === 'published' && formattedPublishedAt != null && (
                    <div className="am-field">
                        <label className="am-field-label">
                            {t('entry.fields.publishedAt')}
                        </label>
                        <p className="am-text-sm am-text-muted">{formattedPublishedAt}</p>
                    </div>
                )}
            </div>
        </Panel>
    );
}
