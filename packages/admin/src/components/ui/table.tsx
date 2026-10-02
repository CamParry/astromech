import type { ComponentProps, MouseEvent, ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { clsx } from 'clsx';
import { ChevronDown, ChevronsUpDown, ChevronUp } from 'lucide-react';
import { createContext, useContext } from 'react';
import { Link } from '../../rendering/cells/link';

export type SortDirection = 'asc' | 'desc' | null;

type SortThProps = ComponentProps<'th'> & {
    sortKey: string;
    currentSort: { key: string; direction: SortDirection } | null;
    onSort: (key: string, direction: SortDirection) => void;
};

const Root = ({ className, children, ...props }: ComponentProps<'table'>) => (
    <div className="am-table-wrapper">
        <table className={clsx('am-table', className)} {...props}>
            {children}
        </table>
    </div>
);

const Head = (props: ComponentProps<'thead'>) => <thead {...props} />;

const Body = (props: ComponentProps<'tbody'>) => <tbody {...props} />;

type RowProps = ComponentProps<'tr'> & {
    /**
     * Where the row leads. Put a `Table.RowLink` in the row's primary cell, so a
     * keyboard or screen reader user gets a link; a click elsewhere in the row opens it too.
     */
    href?: string | undefined;
    selected?: boolean;
};

/** The `href` of the row a `Table.RowLink` sits in. */
const RowHrefContext = createContext<string | undefined>(undefined);

const Row = ({ href, ...props }: RowProps) =>
    href === undefined ? <RowElement {...props} /> : <LinkedRow href={href} {...props} />;

const LinkedRow = ({
    href,
    onClick,
    className,
    ...props
}: RowProps & { href: string }) => {
    const navigate = useNavigate();

    function handleClick(e: MouseEvent<HTMLTableRowElement>): void {
        onClick?.(e);
        if (opensRow(e)) void navigate({ to: href });
    }

    return (
        <RowHrefContext.Provider value={href}>
            <RowElement
                className={clsx('am-table-row-clickable', className)}
                onClick={handleClick}
                {...props}
            />
        </RowHrefContext.Provider>
    );
};

const RowElement = ({ selected, className, ...props }: Omit<RowProps, 'href'>) => (
    <tr
        data-selected={selected ? 'true' : undefined}
        className={clsx(className, selected && 'am-table-row-selected') || undefined}
        {...props}
    />
);

/** A control a click in a linked row may land on, which keeps the click for itself. */
const INTERACTIVE =
    'a, button, input, select, textarea, label, summary, [contenteditable], [role="button"], [role="checkbox"], [role="menuitem"], [role="option"]';

/**
 * True when a click on a linked row should open it: a plain primary click that
 * did not land on a control and did not end a text selection.
 */
function opensRow(e: MouseEvent<HTMLTableRowElement>): boolean {
    if (e.defaultPrevented || e.button !== 0) return false;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
    if (e.target instanceof Element && e.target.closest(INTERACTIVE) !== null) {
        return false;
    }
    return (window.getSelection()?.toString() ?? '') === '';
}

/**
 * The link to the row's `href`, for the row's primary cell (usually its title).
 * Outside a linked row it renders its children as they are.
 */
const RowLink = ({ children }: { children: ReactNode }) => {
    const href = useContext(RowHrefContext);
    if (href === undefined) return <>{children}</>;
    return (
        <Link to={href} className="am-link">
            {children}
        </Link>
    );
};

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
                className={`am-table-sort-btn${isActive ? ' am-table-sort-btn-active' : ''}`}
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

/** Compound table component: `Table.Root`, `Table.Row`, `Table.RowLink`, `Table.SortTh`, etc. */
export const Table = {
    Root,
    Head,
    Body,
    Row,
    RowLink,
    Th,
    SortTh,
    Td,
    Empty,
};
