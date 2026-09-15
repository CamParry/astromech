import type { CellRenderer } from 'astromech';
import { Badge } from '../../components/ui/badge';
import { statusVariant } from './status-variant';

export const BadgeCell: CellRenderer = ({ value }) => (
    <Badge variant={statusVariant(String(value))}>{String(value)}</Badge>
);
