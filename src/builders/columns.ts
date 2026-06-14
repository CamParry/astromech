/**
 * Admin list-view column factories — pure functions returning `AdminColumn`
 * POJOs. Columns are presentation chrome only (they never touch storage); the
 * factory name picks the cell renderer (`kind`). First arg is the entry data key
 * the column reads. Designed for namespaced use: `import * as column`.
 */

import type { AdminColumn } from '@/types/config.js';
import type { Label } from '@/types/fields.js';

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
