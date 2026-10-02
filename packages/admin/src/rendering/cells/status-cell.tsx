import type { CellRenderer } from 'astromech';
import { StatusBadge } from '../../components/ui/status-badge';

/** The row's publication status, labelled from the admin's strings. */
export const StatusCell: CellRenderer = ({ row }) => <StatusBadge status={row.status} />;
