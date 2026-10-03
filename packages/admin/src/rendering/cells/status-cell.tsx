import type { CellRenderer } from 'astromech';
import { isEntryStatus } from 'astromech/shared';
import { StatusBadge } from '../../components/ui/status-badge';

/** A publication status, the row's own or a field's, labelled from the admin's strings. */
export const StatusCell: CellRenderer = ({ value }) =>
    isEntryStatus(value) ? <StatusBadge status={value} /> : String(value ?? '—');
