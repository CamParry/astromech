import type { CellRenderer } from '../types';
import { Check } from 'lucide-react';

export const BooleanCell: CellRenderer = ({ value }) =>
    value ? <Check size={14} /> : <span className="am-text-muted">—</span>;
