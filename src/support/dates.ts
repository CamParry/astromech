/**
 * Date formatting utilities using date-fns
 */

import { format, formatDistanceToNow, parseISO, isValid } from 'date-fns';

/**
 * Format a date as 'MMM d, yyyy' (e.g. 'Jan 15, 2025')
 */
export function formatDate(date: Date | string | null | undefined): string {
    if (!date) return '—';
    const d = typeof date === 'string' ? parseISO(date) : date;
    if (!isValid(d)) return '—';
    return format(d, 'd MMM yyyy');
}

/**
 * Format a date+time as 'MMM d, yyyy, h:mm a' (e.g. 'Jan 15, 2025, 2:30 PM')
 */
export function formatDatetime(date: Date | string | null | undefined): string {
    if (!date) return '—';
    const d = typeof date === 'string' ? parseISO(date) : date;
    if (!isValid(d)) return '—';
    return format(d, 'MMM d, yyyy, h:mm a');
}

/**
 * Format a date as a relative string (e.g. '3 days ago', 'about 2 hours ago')
 */
export function formatRelative(date: Date | string | null | undefined): string {
    if (!date) return '—';
    const d = typeof date === 'string' ? parseISO(date) : date;
    if (!isValid(d)) return '—';
    return formatDistanceToNow(d, { addSuffix: true });
}
