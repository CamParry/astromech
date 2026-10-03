import { describe, expect, it } from 'vitest';
import { ENTRY_STATUSES, isEntryStatus } from '@/exports/shared';

describe('isEntryStatus', () => {
    it.each(ENTRY_STATUSES)('accepts %s', (status) => {
        expect(isEntryStatus(status)).toBe(true);
    });

    it.each(['draft', 'trashed', 'Published', '', null, undefined, 1])(
        'refuses %s',
        (value) => {
            expect(isEntryStatus(value)).toBe(false);
        }
    );
});
