import type { CellRenderer } from '@/types/index.js';

// v1 identical to text to guarantee zero regression; no special alignment yet.
export const NumberCell: CellRenderer = ({ value }) => String(value ?? '—');
