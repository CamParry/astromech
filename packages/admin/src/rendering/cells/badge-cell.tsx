import type { CellRenderer } from '../types';
import { Badge } from '../../components/ui/badge';
import { statusVariant } from './status-variant';

export const BadgeCell: CellRenderer = ({ value }) => (
    <Badge variant={statusVariant(String(value))}>{String(value)}</Badge>
);
