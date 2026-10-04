/**
 * The sidebar panel for an entry's or a global's status: the status select,
 * the publish date while scheduled, and the published date once it is live.
 */

import type { EntryStatus } from 'astromech';
import { ENTRY_STATUSES, isEntryStatus } from 'astromech/shared';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatDatetime } from '../../utilities/dates';
import { FieldControlProvider } from '../fields/field-control-context';
import { Input } from '../ui/input';
import { Panel } from '../ui/panel';
import { Select } from '../ui/select';
import { ENTRY_STATUS_LABEL_KEYS } from '../ui/status-badge';

export type PublishPanelProps = {
    status: EntryStatus;
    /** Form state for the `datetime-local` input, so a `YYYY-MM-DDTHH:mm` string. */
    publishedAt: string;
    /** The saved row's value, shown as text once the entry is published. */
    entryPublishedAt?: Date | string | null | undefined;
    onStatusChange: (status: EntryStatus) => void;
    onPublishedAtChange: (value: string) => void;
    readOnly?: boolean;
    /** A note under the status select, such as why it cannot be changed. */
    hint?: string | undefined;
};

export function PublishPanel({
    status,
    publishedAt,
    entryPublishedAt,
    onStatusChange,
    onPublishedAtChange,
    readOnly = false,
    hint,
}: PublishPanelProps): React.ReactElement {
    const { t } = useTranslation();
    const statusId = React.useId();
    const hintId = React.useId();

    const statusOptions = ENTRY_STATUSES.map((value) => ({
        value,
        label: t(ENTRY_STATUS_LABEL_KEYS[value]),
    }));

    const formattedPublishedAt =
        entryPublishedAt != null ? formatDatetime(entryPublishedAt) : null;

    return (
        <Panel title={t('entries.statusPanel')}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="am-field">
                    <label className="am-field-label" htmlFor={statusId}>
                        {t('entries.statusField')}
                    </label>
                    <FieldControlProvider
                        value={{
                            hasError: false,
                            errorId: undefined,
                            descriptionId: hint !== undefined ? hintId : undefined,
                        }}
                    >
                        <Select
                            id={statusId}
                            value={status}
                            onValueChange={(v) => {
                                if (isEntryStatus(v)) onStatusChange(v);
                            }}
                            options={statusOptions}
                            disabled={readOnly}
                        />
                    </FieldControlProvider>
                    {hint !== undefined && (
                        <p id={hintId} className="am-field-hint">
                            {hint}
                        </p>
                    )}
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
