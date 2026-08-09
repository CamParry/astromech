import type { CellRenderer } from '@/types/index';

export const TextCell: CellRenderer = ({ value }) => String(value ?? '—');
