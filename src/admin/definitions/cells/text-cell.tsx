import type { CellRenderer } from '@/types/index.js';

export const TextCell: CellRenderer = ({ value }) => String(value ?? '—');
