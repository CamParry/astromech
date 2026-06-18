import type { CellRenderer } from '@/types/index.js';
import { Link } from './link.js';

export const TitleCell: CellRenderer = ({ entry, ctx }) =>
    ctx.isTrash ? (
        <span className="am-text-muted">{entry.title}</span>
    ) : (
        <Link to={`${ctx.basePath}/${entry.id}`} className="am-link">
            {entry.title}
        </Link>
    );
