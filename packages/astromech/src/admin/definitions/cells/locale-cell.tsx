import type { CellRenderer } from '@/types/index.js';

export const LocaleCell: CellRenderer = ({ value }) => (
    <span className="am-text-mono am-text-muted">{String(value).toUpperCase()}</span>
);
