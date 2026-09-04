import type { CellRenderer } from '@/types/index';
import { authorName } from '@/admin/hooks/author-names';

/** An author user id as a name; nothing at all when the id cannot be resolved. */
export const AuthorCell: CellRenderer = ({ value, ctx }) => {
    const name = authorName(value as string | null, ctx.authorNames);
    if (name === undefined) return null;
    return <span className="am-text-sm am-text-muted">{name}</span>;
};
