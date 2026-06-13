import type { CellRenderer } from '@/types/index.js';
import { formatDate } from '@/support/dates.js';

export const DateCell: CellRenderer = ({ value }) => (
    <span className="am-text-sm am-text-muted">
        {formatDate(value as Date | string | null | undefined)}
    </span>
);
