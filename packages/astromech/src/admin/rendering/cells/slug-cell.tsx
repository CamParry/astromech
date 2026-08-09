import type { CellRenderer } from '@/types/index';

export const SlugCell: CellRenderer = ({ value }) => (
    <span className="am-text-mono am-text-muted">{(value as string) ?? '—'}</span>
);
