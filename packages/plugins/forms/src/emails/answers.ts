/** One answer, resolved to its human label and a display string. */
export type AnswerRow = { label: string; value: string };

/**
 * Stringify a submitted value for display in an email. Shared by the
 * placeholders module (subject/body tokens) and the answers table.
 */
export function displayValue(value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) {
        // Multiselect/checkboxGroup fields submit an array of options.
        return value.length === 0 ? '—' : value.map((item) => String(item)).join(', ');
    }
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') return JSON.stringify(value);
    if (value === '') return '—';
    return String(value);
}

/**
 * Pair submitted data with the field labels it was collected under.
 * `fields` is intentionally a minimal structural type so this module does not
 * depend on the field compiler.
 */
export function toAnswerRows(
    fields: readonly { name: string; label?: unknown }[],
    data: Record<string, unknown>
): AnswerRow[] {
    // Order follows `fields`, not `data` — the form's own order is what the
    // author expects to read. A field absent from `data` still appears,
    // because `displayValue(undefined)` resolves to the em-dash placeholder.
    return fields.map((field) => ({
        label: typeof field.label === 'string' ? field.label : field.name,
        value: displayValue(data[field.name]),
    }));
}
