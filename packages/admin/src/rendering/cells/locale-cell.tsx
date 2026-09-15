import type { CellRenderer } from 'astromech';

export const LocaleCell: CellRenderer = ({ value }) => (
    <span className="am-text-mono am-text-muted">{String(value).toUpperCase()}</span>
);
