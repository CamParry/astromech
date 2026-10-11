/**
 * Field value formatters and type converters
 * Centralized logic for converting values between database and input formats
 */

/**
 * Format a datetime value for a `datetime-local` input (YYYY-MM-DDTHH:MM) in
 * local time, the zone `new Date(inputValue)` reads it back in.
 */
export function formatDatetimeForInput(value: unknown): string {
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

/** A date-time that ends with a zone: `Z` or an offset such as `+02:00`. */
const ZONE_RE = /(?:Z|[+-]\d{2}:\d{2})$/;

/** A bare `YYYY-MM-DD` date. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** What a `datetime-local` input holds: a local date and time, no zone. */
const LOCAL_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/;

/** The date a date-time is written with, before its `T`. */
const DATE_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})T/;

/**
 * Whether a stored `datetime` value is an instant: written with a zone, which
 * core stores as UTC (`2026-10-10T09:00:00.000Z`). A value without one is the
 * wall time the admin's input sent.
 */
export function hasZone(value: string): boolean {
    return ZONE_RE.test(value);
}

/**
 * A stored `datetime` value as a `datetime-local` input shows it. An instant
 * shows in the editor's local time, a wall time as it is, and a bare date at
 * midnight.
 */
export function datetimeInputValue(value: unknown): string {
    if (typeof value !== 'string') return '';
    if (DATE_RE.test(value)) return `${value}T00:00`;
    return hasZone(value) ? formatDatetimeForInput(value) : value;
}

/**
 * The value a `datetime` field stores for what its input holds. When the field
 * holds an instant, the input's local time is sent as UTC so it stays one;
 * otherwise the wall time is sent as the input holds it.
 */
export function datetimeFromInput(input: string, zoned: boolean): string {
    if (!zoned || !LOCAL_DATETIME_RE.test(input)) return input;
    const date = new Date(input);
    return Number.isNaN(date.getTime()) ? input : date.toISOString();
}

/**
 * A stored `date` value as a `date` input shows it. Core stores `YYYY-MM-DD`;
 * a full ISO value, from before it did, shows the date it is written with,
 * which is the date core stores it as on the next save.
 */
export function dateInputValue(value: unknown): string {
    if (typeof value !== 'string') return '';
    if (DATE_RE.test(value)) return value;
    return DATE_PREFIX_RE.exec(value)?.[1] ?? '';
}
