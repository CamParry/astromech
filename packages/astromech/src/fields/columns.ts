/**
 * Admin list-view column factories — pure functions returning `AdminColumn`
 * POJOs. Presentational only; the factory name picks the cell renderer
 * (`kind`), and the first arg is the entry data key the column reads.
 */

import type { AdminColumn } from '@/types/config';
import type { Label } from '@/types/fields';

type ColumnOptions = { label?: Label; sortable?: boolean };

export function text(field: string, options?: ColumnOptions): AdminColumn {
    return { field, kind: 'text', ...options };
}

export function badge(field: string, options?: ColumnOptions): AdminColumn {
    return { field, kind: 'badge', ...options };
}

export function boolean(field: string, options?: ColumnOptions): AdminColumn {
    return { field, kind: 'boolean', ...options };
}

export function date(field: string, options?: ColumnOptions): AdminColumn {
    return { field, kind: 'date', ...options };
}

export function number(field: string, options?: ColumnOptions): AdminColumn {
    return { field, kind: 'number', ...options };
}

export function relationship(field: string, options?: ColumnOptions): AdminColumn {
    return { field, kind: 'relationship', ...options };
}

export function slug(field: string, options?: ColumnOptions): AdminColumn {
    return { field, kind: 'slug', ...options };
}
