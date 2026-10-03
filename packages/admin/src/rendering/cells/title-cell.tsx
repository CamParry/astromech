import type { CellRenderer } from 'astromech';

/** The entry's title; the entries list makes it the row's link. */
export const TitleCell: CellRenderer = ({ row, ctx }) =>
    ctx.isTrash ? <span className="am-text-muted">{row.title}</span> : <>{row.title}</>;
