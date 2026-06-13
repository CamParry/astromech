import type { CellKind, FieldType } from '@/types/index.js';

const FIELD_TYPE_TO_CELL_KIND: Partial<Record<FieldType, CellKind>> = {
    boolean: 'boolean',
    number: 'number',
    range: 'number',
    date: 'date',
    datetime: 'date',
    slug: 'slug',
    relationship: 'relationship',
    // text/textarea/select/multiselect/email/url/color/... fall through to 'text'
};

/** Default display cell kind for a column over a field of the given type. */
export function defaultCellKind(fieldType: string): CellKind {
    return FIELD_TYPE_TO_CELL_KIND[fieldType as FieldType] ?? 'text';
}
