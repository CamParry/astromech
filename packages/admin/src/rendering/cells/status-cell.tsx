import type { CellRenderer } from 'astromech';
import { StatusBadge } from '../../components/ui/status-badge';
import { isEntryStatus } from './status-variant';

/** A publication status, the row's own or a field's, labelled from the admin's strings. */
export const StatusCell: CellRenderer = ({ value }) =>
    isEntryStatus(value) ? <StatusBadge status={value} /> : String(value ?? '—');
