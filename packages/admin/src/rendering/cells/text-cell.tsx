import type { CellRenderer } from 'astromech';

export const TextCell: CellRenderer = ({ value }) => String(value ?? '—');
