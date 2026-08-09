import type { CellRenderer } from '@/types/index';
import { Badge } from '@/admin/components/ui/index';
import { statusVariant } from './status-variant';

export const BadgeCell: CellRenderer = ({ value }) => (
    <Badge variant={statusVariant(String(value))}>{String(value)}</Badge>
);
