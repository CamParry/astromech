import type { CellRenderer } from 'astromech';
import { formatDate } from '../../utilities/dates';

export const DateCell: CellRenderer = ({ value }) => (
    <span className="am-text-sm am-text-muted">
        {formatDate(value as Date | string | null | undefined)}
    </span>
);
