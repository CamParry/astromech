import type { CellRenderer } from 'astromech';
import { Check } from 'lucide-react';

export const BooleanCell: CellRenderer = ({ value }) =>
    value ? <Check size={14} /> : <span className="am-text-muted">—</span>;
