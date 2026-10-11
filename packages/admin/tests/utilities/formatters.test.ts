/**
 * `formatDatetimeForInput`, which seeds a `datetime-local` input. The form reads
 * the input back with `new Date(value)`, which parses in local time, so the
 * formatter must write local time too or every save shifts the time. The
 * `datetime` and `date` fields' converters build on it.
 */

import { describe, expect, it } from 'vitest';
import {
    dateInputValue,
    datetimeFromInput,
    datetimeInputValue,
    formatDatetimeForInput,
} from '../../src/utilities/formatters';

// The `admin-timezone` project in `vitest.config.ts` runs this file with
// `TZ=America/Los_Angeles`, a zone with a non-zero offset all year, so a
// UTC/local mix-up shows as drift. The first test fails if that setting is lost.

describe('formatDatetimeForInput', () => {
    const scheduled = new Date('2026-09-22T18:45:00.000Z');

    it('runs in America/Los_Angeles, whose offset is not zero', () => {
        expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(
            'America/Los_Angeles'
        );
        expect(scheduled.getTimezoneOffset()).not.toBe(0);
    });

    it('round-trips a date through new Date() without drift', () => {
        const value = formatDatetimeForInput(scheduled);

        expect(value).toBe('2026-09-22T11:45');
        expect(new Date(value).getTime()).toBe(scheduled.getTime());
    });

    it('round-trips an ISO string as the API sends it', () => {
        const value = formatDatetimeForInput(scheduled.toISOString());

        expect(new Date(value).getTime()).toBe(scheduled.getTime());
    });

    it('returns an empty string for no date or an invalid one', () => {
        expect(formatDatetimeForInput(null)).toBe('');
        expect(formatDatetimeForInput(undefined)).toBe('');
        expect(formatDatetimeForInput('not a date')).toBe('');
    });
});

describe('a datetime field value in its input', () => {
    it('shows a value stored in UTC in local time', () => {
        // Los Angeles is UTC-7 in October.
        expect(datetimeInputValue('2026-10-10T09:00:00.000Z')).toBe('2026-10-10T02:00');
    });

    it('shows a wall time as it is, and a bare date at midnight', () => {
        expect(datetimeInputValue('2026-10-10T09:00')).toBe('2026-10-10T09:00');
        expect(datetimeInputValue('2026-10-10')).toBe('2026-10-10T00:00');
    });

    it('shows nothing for no value', () => {
        expect(datetimeInputValue(undefined)).toBe('');
        expect(datetimeInputValue(null)).toBe('');
    });

    it('sends an edit to a UTC value as UTC, read in local time', () => {
        expect(datetimeFromInput('2026-10-11T08:30', true)).toBe(
            '2026-10-11T15:30:00.000Z'
        );
    });

    it('sends an edit to a wall time, and a cleared input, as the input holds it', () => {
        expect(datetimeFromInput('2026-10-11T08:30', false)).toBe('2026-10-11T08:30');
        expect(datetimeFromInput('', true)).toBe('');
    });
});

describe('a date field value in its input', () => {
    it('shows a YYYY-MM-DD value as it is', () => {
        expect(dateInputValue('2026-10-10')).toBe('2026-10-10');
    });

    it('shows the date a full ISO value is written with', () => {
        expect(dateInputValue('2026-10-10T00:00:00.000Z')).toBe('2026-10-10');
        expect(dateInputValue('2026-10-10T23:30:00+02:00')).toBe('2026-10-10');
    });

    it('shows nothing for no value or another form', () => {
        expect(dateInputValue(undefined)).toBe('');
        expect(dateInputValue('Oct 10 2026')).toBe('');
    });
});
