import type { CellRenderer } from 'astromech';
import { Link } from './link';

export const TitleCell: CellRenderer = ({ row, ctx }) =>
    ctx.isTrash ? (
        <span className="am-text-muted">{row.title}</span>
    ) : (
        <Link to={`${ctx.basePath}/${row.id}`} className="am-link">
            {row.title}
        </Link>
    );
