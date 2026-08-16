/**
 * The per-column storage format options — `col.timestamp({ storage: 'seconds' })`
 * and `col.id({ format: 'uuid' })`.
 *
 * These describe a format another writer already owns on disk (better-auth's
 * users table), so the assertions go down to the encoded cell rather than
 * stopping at the round trip.
 */

import { describe, expect, it } from 'vitest';
import { defineTable } from '@/database/define-table';
import { decodeWith, encodeWith } from '@/database/codec';

const WHEN = new Date('2024-03-04T05:06:07.000Z');

const fixture = defineTable('column_formats', ({ col }) => ({
    id: col.id({ format: 'uuid' }),
    ulidId: col.text({ defaultUlid: true }),
    isoAt: col.timestamp({ notNull: true, defaultNow: true }),
    secondsAt: col.timestamp({ notNull: true, defaultNow: true, storage: 'seconds' }),
}));

describe('seconds timestamps', () => {
    it('encodes a Date to unix seconds and decodes it back', () => {
        const encoded = encodeWith(fixture, { isoAt: WHEN, secondsAt: WHEN });
        expect(encoded.secondsAt).toBe(Math.floor(WHEN.getTime() / 1000));
        expect(encoded.isoAt).toBe(WHEN.toISOString());

        const decoded = decodeWith(fixture, {
            secondsAt: encoded.secondsAt,
            isoAt: encoded.isoAt,
        });
        expect(decoded.secondsAt).toEqual(WHEN);
        expect(decoded.isoAt).toEqual(WHEN);
    });

    it('serializes an app default (defaultNow) in the declared format', () => {
        const encoded = encodeWith(fixture, {});
        expect(typeof encoded.secondsAt).toBe('number');
        expect(typeof encoded.isoAt).toBe('string');
    });
});

describe('uuid ids', () => {
    it('mints a uuid for a `format: "uuid"` id and a ULID for a defaultUlid text column', () => {
        const encoded = encodeWith(fixture, {});
        expect(encoded.id).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
        );
        expect(encoded.ulidId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    });

    it('keeps a caller-supplied id', () => {
        const encoded = encodeWith(fixture, { id: 'supplied' });
        expect(encoded.id).toBe('supplied');
    });
});
