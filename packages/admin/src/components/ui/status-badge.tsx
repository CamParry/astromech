/**
 * The publication status of one content row, as a badge with its English (or
 * translated) label. Every place the admin or a plugin shows an entry's or a
 * global's status renders this.
 */

import type { EntryStatus } from 'astromech';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from './badge';

/** Each status's label key in the admin's strings. */
export const ENTRY_STATUS_LABEL_KEYS: Record<EntryStatus, string> = {
    unpublished: 'entries.unpublished',
    published: 'entries.published',
    scheduled: 'entries.scheduled',
};

export type StatusBadgeProps = { status: EntryStatus };

/** One status as a badge, styled by its own badge variant. */
export function StatusBadge({ status }: StatusBadgeProps): React.ReactElement {
    const { t } = useTranslation();
    return <Badge variant={status}>{t(ENTRY_STATUS_LABEL_KEYS[status])}</Badge>;
}
