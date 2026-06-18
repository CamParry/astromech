/**
 * Date formatting utilities.
 *
 * Display formatting uses `Intl.DateTimeFormat` so the rendered format follows
 * a locale (e.g. `14 Jun 2026` for `en-GB` vs `Jun 14, 2026` for `en-US`). The
 * locale is install-wide — set once at admin boot from the config's
 * `defaultLocale` via {@link setDateLocale}. When unset, the runtime default
 * locale is used.
 */

import { formatDistanceToNow, parseISO, isValid } from 'date-fns';

let displayLocale: string | undefined;
const formatterCache = new Map<string, Intl.DateTimeFormat>();

/**
 * Set the install-wide display locale for {@link formatDate} /
 * {@link formatDatetime}. Called once at admin boot with the config's
 * `defaultLocale`. Passing `undefined` reverts to the runtime default.
 */
export function setDateLocale(locale: string | undefined): void {
    displayLocale = locale;
    formatterCache.clear();
}

function toDate(date: Date | string | null | undefined): Date | null {
    if (!date) return null;
    const d = typeof date === 'string' ? parseISO(date) : date;
    return isValid(d) ? d : null;
}

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
};

const DATETIME_OPTIONS: Intl.DateTimeFormatOptions = {
    ...DATE_OPTIONS,
    hour: 'numeric',
    minute: '2-digit',
};

/** Cache formatters per locale+kind — construction is the expensive part. */
function getFormatter(
    kind: string,
    options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat {
    const key = `${displayLocale ?? ''}|${kind}`;
    let formatter = formatterCache.get(key);
    if (formatter === undefined) {
        formatter = new Intl.DateTimeFormat(displayLocale, options);
        formatterCache.set(key, formatter);
    }
    return formatter;
}

/** Format a date in the display locale, e.g. `14 Jun 2026`. */
export function formatDate(date: Date | string | null | undefined): string {
    const d = toDate(date);
    if (!d) return '—';
    return getFormatter('date', DATE_OPTIONS).format(d);
}

/** Format a date+time in the display locale, e.g. `14 Jun 2026, 2:30 PM`. */
export function formatDatetime(date: Date | string | null | undefined): string {
    const d = toDate(date);
    if (!d) return '—';
    return getFormatter('datetime', DATETIME_OPTIONS).format(d);
}

/** Format a date as a relative string (e.g. '3 days ago'). */
export function formatRelative(date: Date | string | null | undefined): string {
    const d = toDate(date);
    if (!d) return '—';
    return formatDistanceToNow(d, { addSuffix: true });
}
