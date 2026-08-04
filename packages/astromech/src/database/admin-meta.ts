/**
 * Admin metadata — a `TableDescriptor` projected into the admin's existing
 * table-column/field vocabulary (`CellKind`, `FieldDefinition['type']`).
 *
 * Pure, serializable — no db imports. Lets a table-backed admin surface (e.g.
 * step 5's `tableStorage` replacement) describe itself for the shell's list/
 * form renderers without hand-maintaining a parallel column list per table.
 */

import { resolveReferenceTarget } from '@/database/descriptor-snapshot.js';
import type { ColumnKind, TableDescriptor } from '@/database/define-table.js';
import type { CellKind } from '@/types/resolved.js';
import type { FieldType } from '@/types/fields.js';

export type ColumnAdminMeta = {
    /** camelCase descriptor key — the data key the admin reads. */
    name: string;
    cellKind: CellKind;
    fieldType: FieldType;
    nullable: boolean;
    enumValues?: readonly string[];
    /** Resolved target table name, `reference` columns only. */
    referenceTable?: string;
};

const KIND_META: Record<ColumnKind, { cellKind: CellKind; fieldType: FieldType }> = {
    id: { cellKind: 'text', fieldType: 'text' },
    text: { cellKind: 'text', fieldType: 'text' },
    integer: { cellKind: 'number', fieldType: 'number' },
    real: { cellKind: 'number', fieldType: 'number' },
    boolean: { cellKind: 'boolean', fieldType: 'boolean' },
    // Storage is ISO-TEXT, always carrying time-of-day — 'datetime' fits the
    // stored precision better than the date-only field type.
    timestamp: { cellKind: 'date', fieldType: 'datetime' },
    json: { cellKind: 'text', fieldType: 'json' },
    enum: { cellKind: 'badge', fieldType: 'select' },
    reference: { cellKind: 'relationship', fieldType: 'relationship' },
};

/** Project a descriptor's columns into admin column/field metadata, in
 *  declaration order. */
export function tableAdminMeta(table: TableDescriptor): ColumnAdminMeta[] {
    return Object.entries(table.columns).map(([key, col]) => {
        const { cellKind, fieldType } = KIND_META[col.kind];
        return {
            name: key,
            cellKind,
            fieldType,
            nullable: !col.notNull,
            ...(col.enumValues !== undefined && { enumValues: col.enumValues }),
            ...(col.reference !== undefined && {
                referenceTable: resolveReferenceTarget(col.reference.target()).table,
            }),
        };
    });
}
