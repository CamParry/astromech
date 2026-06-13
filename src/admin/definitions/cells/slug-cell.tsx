import type { CellRenderer } from '@/types/index.js';

export const SlugCell: CellRenderer = ({ value }) => (
    <span className="am-text-mono am-text-muted">{(value as string) ?? '—'}</span>
);
