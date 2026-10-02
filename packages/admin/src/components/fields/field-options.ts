/**
 * A choice field's `options` as value and label pairs, for the select,
 * multiselect, radio and checkbox controls and the admin resource list cell.
 */

import type { DataField, Label } from 'astromech';

/** One option with its label resolved to text. */
type FieldOption = { value: string; label: string };

/** The field's options with each label resolved; a bare string is its own label. */
export function fieldOptions(
    field: DataField,
    label: (value: Label | undefined, name: string) => string
): FieldOption[] {
    return (field.options ?? []).map((option) =>
        typeof option === 'string'
            ? { value: option, label: option }
            : { value: option.value, label: label(option.label, option.value) }
    );
}
