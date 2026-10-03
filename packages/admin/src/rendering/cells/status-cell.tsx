import type { CellRenderer, EntryStatus } from 'astromech';
import { ENTRY_STATUSES } from 'astromech/shared';
import { StatusBadge } from '../../components/ui/status-badge';

/** A publication status, the row's own or a field's, labelled from the admin's strings. */
export const StatusCell: CellRenderer = ({ value }) =>
    isEntryStatus(value) ? <StatusBadge status={value} /> : String(value ?? '—');

function isEntryStatus(value: unknown): value is EntryStatus {
    return ENTRY_STATUSES.some((status) => status === value);
}
