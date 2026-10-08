import type { CellRenderer } from '../types';

export const TextCell: CellRenderer = ({ value }) => String(value ?? '—');
