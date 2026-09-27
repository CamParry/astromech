/** The one `publishedAt` rule every entry and global write path applies. */

import { describe, expect, it } from 'vitest';
import { resolvePublishedAt } from '@/content/published-at';

const now = new Date('2026-06-01T00:00:00.000Z');
const past = new Date('2026-01-01T00:00:00.000Z');
const future = new Date('2026-12-01T00:00:00.000Z');

describe('resolvePublishedAt', () => {
    it('stores the date the caller sends, whatever the status', () => {
        expect(
            resolvePublishedAt({ status: 'published', given: future, current: past, now })
        ).toBe(future);
        expect(
            resolvePublishedAt({ status: 'unpublished', given: past, current: null, now })
        ).toBe(past);
        expect(
            resolvePublishedAt({ status: undefined, given: null, current: past, now })
        ).toBeNull();
    });

    it('publishing keeps a past date and otherwise takes now', () => {
        expect(
            resolvePublishedAt({
                status: 'published',
                given: undefined,
                current: past,
                now,
            })
        ).toBe(past);
        expect(
            resolvePublishedAt({
                status: 'published',
                given: undefined,
                current: future,
                now,
            })
        ).toBe(now);
        expect(
            resolvePublishedAt({
                status: 'published',
                given: undefined,
                current: null,
                now,
            })
        ).toBe(now);
    });

    it('unpublishing clears the date', () => {
        expect(
            resolvePublishedAt({
                status: 'unpublished',
                given: undefined,
                current: past,
                now,
            })
        ).toBeNull();
    });

    it('scheduling keeps the row date', () => {
        expect(
            resolvePublishedAt({
                status: 'scheduled',
                given: undefined,
                current: future,
                now,
            })
        ).toBe(future);
        expect(
            resolvePublishedAt({
                status: 'scheduled',
                given: undefined,
                current: null,
                now,
            })
        ).toBeNull();
    });

    it('leaves the column alone when the write sets no status', () => {
        expect(
            resolvePublishedAt({
                status: undefined,
                given: undefined,
                current: past,
                now,
            })
        ).toBeUndefined();
    });
});
