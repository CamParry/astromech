import type { CellRenderer } from '@/types/index.js';

// v1 thin placeholder, identical to text; improved demand-driven later.
export const RelationshipCell: CellRenderer = ({ value }) => String(value ?? '—');
