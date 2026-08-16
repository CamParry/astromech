/**
 * Timestamp and id storage formats: ISO-8601 TEXT timestamps, and
 * `col.id({ format: 'uuid' })`.
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
}));

describe('timestamps', () => {
    it('encodes a Date to ISO text and decodes it back', () => {
        const encoded = encodeWith(fixture, { isoAt: WHEN });
        expect(encoded.isoAt).toBe(WHEN.toISOString());

        const decoded = decodeWith(fixture, { isoAt: encoded.isoAt });
        expect(decoded.isoAt).toEqual(WHEN);
    });

    it('serializes an app default (defaultNow) as ISO text', () => {
        const encoded = encodeWith(fixture, {});
        expect(typeof encoded.isoAt).toBe('string');
    });

    // Rows written while `users` declared seconds storage still hold a number.
    it('decodes a unix-seconds number left by an older writer', () => {
        const decoded = decodeWith(fixture, { isoAt: WHEN.getTime() / 1000 });
        expect(decoded.isoAt).toEqual(WHEN);
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
