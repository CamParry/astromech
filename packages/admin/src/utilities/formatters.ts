/**
 * Field value formatters and type converters
 * Centralized logic for converting values between database and input formats
 */

import type { FieldTypeName } from 'astromech';

/**
 * Format a date value for date input (YYYY-MM-DD)
 */
function formatDateForInput(value: unknown): string {
    if (!value) return '';

    const date = value instanceof Date ? value : new Date(value as string);
    if (isNaN(date.getTime())) return '';

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

/**
 * Format a datetime value for datetime-local input (YYYY-MM-DDTHH:MM)
 */
function formatDatetimeForInput(value: unknown): string {
    if (!value) return '';

    const date = value instanceof Date ? value : new Date(value as string);
    if (isNaN(date.getTime())) return '';

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Format a value for display in an input field
 */
export function formatValueForInput(value: unknown, fieldType: FieldTypeName): string {
    if (value == null) return '';

    switch (fieldType) {
        case 'date':
            return formatDateForInput(value);
        case 'datetime':
            return formatDatetimeForInput(value);
        case 'number':
            return String(value);
        case 'boolean':
            return value ? 'true' : 'false';
        case 'color':
            return value ? String(value) : '#000000';
        default:
            return String(value);
    }
}
