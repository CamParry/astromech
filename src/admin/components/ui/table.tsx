import type { ComponentProps } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

export type SortDirection = 'asc' | 'desc' | null;

type SortThProps = ComponentProps<'th'> & {
    sortKey: string;
    currentSort: { key: string; direction: SortDirection } | null;
    onSort: (key: string, direction: SortDirection) => void;
};

// ============================================================================
// Components
// ============================================================================

const Root = ({ className, children, ...props }: ComponentProps<'table'>) => (
    <div className="am-table-wrapper">
        <table className={['am-table', className].filter(Boolean).join(' ')} {...props}>
            {children}
        </table>
    </div>
);

const Head = (props: ComponentProps<'thead'>) => <thead {...props} />;

const Body = (props: ComponentProps<'tbody'>) => <tbody {...props} />;

type RowProps = ComponentProps<'tr'> & {
    href?: string | undefined;
    selected?: boolean;
};

const Row = ({ href, selected, className, ...props }: RowProps) => (
    <tr
        data-href={href}
        data-selected={selected ? 'true' : undefined}
        className={[
            className,
            href ? 'am-table-row--clickable' : '',
            selected ? 'am-table-row--selected' : '',
        ]
            .filter(Boolean)
            .join(' ') || undefined}
        {...props}
    />
);

const Th = (props: ComponentProps<'th'>) => <th {...props} />;

const SortTh = ({ sortKey, currentSort, onSort, children, ...props }: SortThProps) => {
    const isActive = currentSort?.key === sortKey;
    const direction = isActive ? currentSort.direction : null;

    function handleClick() {
        if (!isActive || direction === null) {
            onSort(sortKey, 'asc');
        } else if (direction === 'asc') {
            onSort(sortKey, 'desc');
        } else {
            onSort(sortKey, null);
        }
    }

    return (
        <th {...props}>
            <button
                type="button"
                className={`am-table-sort-btn${isActive ? ' am-table-sort-btn--active' : ''}`}
                onClick={handleClick}
                aria-sort={
                    direction === 'asc'
                        ? 'ascending'
                        : direction === 'desc'
                          ? 'descending'
                          : 'none'
                }
            >
                {children}
                <span className="am-table-sort-icon" aria-hidden="true">
                    {!isActive || direction === null ? (
                        <ChevronsUpDown size={12} />
                    ) : direction === 'asc' ? (
                        <ChevronUp size={12} />
                    ) : (
                        <ChevronDown size={12} />
                    )}
                </span>
            </button>
        </th>
    );
};

const Td = (props: ComponentProps<'td'>) => <td {...props} />;

type EmptyProps = ComponentProps<'td'> & { colSpan: number };

const Empty = ({ colSpan, children, ...props }: EmptyProps) => (
    <tr>
        <td colSpan={colSpan} className="am-table-empty" {...props}>
            {children}
        </td>
    </tr>
);

export const Table = {
    Root,
    Head,
    Body,
    Row,
    Th,
    SortTh,
    Td,
    Empty,
};
