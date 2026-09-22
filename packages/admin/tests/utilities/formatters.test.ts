/**
 * `formatDatetimeForInput`, which seeds a `datetime-local` input. The form reads
 * the input back with `new Date(value)`, which parses in local time, so the
 * formatter must write local time too or every save shifts the time.
 */

import { describe, expect, it } from 'vitest';
import { formatDatetimeForInput } from '../../src/utilities/formatters';

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
