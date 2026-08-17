/**
 * PublishPanel — sidebar panel for managing entry publish status.
 *
 * Renders status select, datetime picker (when scheduled), and shows
 * the published date when the entry is live.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Panel, Select, Input } from '../ui/index';
import { formatDatetime } from '@/utilities/dates';
import type { EntryStatus } from '../../../types/index';

// ============================================================================
// Types
// ============================================================================

export type PublishPanelProps = {
    status: EntryStatus;
    /** Form state for the `datetime-local` input, so a `YYYY-MM-DDTHH:mm` string. */
    publishedAt: string;
    /** The saved row's value, shown as text once the entry is published. */
    entryPublishedAt?: Date | string | null | undefined;
    onStatusChange: (status: EntryStatus) => void;
    onPublishedAtChange: (value: string) => void;
    readOnly?: boolean;
};

// ============================================================================
// Component
// ============================================================================

export function PublishPanel({
    status,
    publishedAt,
    entryPublishedAt,
    onStatusChange,
    onPublishedAtChange,
    readOnly = false,
}: PublishPanelProps): React.ReactElement {
    const { t } = useTranslation();

    const statusOptions = [
        { value: 'unpublished' as EntryStatus, label: t('entries.unpublished') },
        { value: 'published' as EntryStatus, label: t('entries.published') },
        { value: 'scheduled' as EntryStatus, label: t('entries.scheduled') },
    ];

    const formattedPublishedAt =
        entryPublishedAt != null ? formatDatetime(entryPublishedAt) : null;

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
                        <label className="am-field-label" htmlFor="entry-published-at">
                            {t('entries.publishedAtField')}
                        </label>
                        <Input
                            id="entry-published-at"
                            type="datetime-local"
                            value={publishedAt}
                            onChange={(e) => onPublishedAtChange(e.target.value)}
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
