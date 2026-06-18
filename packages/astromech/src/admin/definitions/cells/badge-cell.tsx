import type { CellRenderer } from '@/types/index.js';
import { Badge } from '@/admin/components/ui/index.js';
import { statusVariant } from './status-variant.js';

export const BadgeCell: CellRenderer = ({ value }) => (
    <Badge variant={statusVariant(String(value))}>{String(value)}</Badge>
);
