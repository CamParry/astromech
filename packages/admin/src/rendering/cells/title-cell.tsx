import type { CellRenderer } from 'astromech';
import { Link } from './link';

export const TitleCell: CellRenderer = ({ entry, ctx }) =>
    ctx.isTrash ? (
        <span className="am-text-muted">{entry.title}</span>
    ) : (
        <Link to={`${ctx.basePath}/${entry.id}`} className="am-link">
            {entry.title}
        </Link>
    );
