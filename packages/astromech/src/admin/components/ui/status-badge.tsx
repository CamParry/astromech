/**
 * The publication status of one content row, as a badge. Shared by the entry
 * and global edit pages, which read the same `EntryStatus` vocabulary.
 */

import type { EntryStatus } from '@/types/index';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from './badge';

export type StatusBadgeProps = { status: EntryStatus };

export function StatusBadge({ status }: StatusBadgeProps): React.ReactElement {
    const { t } = useTranslation();
    const variant =
        status === 'published'
            ? 'success'
            : status === 'scheduled'
              ? 'warning'
              : 'neutral';
    const label =
        status === 'published'
            ? t('entries.published')
            : status === 'scheduled'
              ? t('entries.scheduled')
              : t('entries.unpublished');
    return <Badge variant={variant}>{label}</Badge>;
}
