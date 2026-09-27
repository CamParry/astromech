/** The one `publishedAt` rule every entry and global write path applies. */

import type { EntryStatus } from '@/types/index';
import { describe, expect, it } from 'vitest';
import { resolvePublishedAt } from '@/content/published-at';

const now = new Date('2026-06-01T00:00:00.000Z');
const past = new Date('2026-01-01T00:00:00.000Z');
const future = new Date('2026-12-01T00:00:00.000Z');

/** A row before the write. */
function row(status: EntryStatus, publishedAt: Date | null) {
    return { status, publishedAt };
}

describe('resolvePublishedAt', () => {
    it('stores the date the caller sends, whatever the status', () => {
        expect(
            resolvePublishedAt({
                status: 'published',
                given: future,
                current: row('published', past),
                now,
            })
        ).toBe(future);
        expect(
            resolvePublishedAt({ status: 'unpublished', given: past, current: null, now })
        ).toBe(past);
        expect(
            resolvePublishedAt({
                status: undefined,
                given: null,
                current: row('published', past),
                now,
            })
        ).toBeNull();
    });

    it('keeps an already-published row’s date, whatever it holds', () => {
        for (const date of [past, future, null]) {
            expect(
                resolvePublishedAt({
                    status: 'published',
                    given: undefined,
                    current: row('published', date),
                    now,
                })
            ).toBe(date);
        }
    });

    it('stamps now on a row becoming published', () => {
        for (const current of [
            row('scheduled', future),
            row('unpublished', past),
            null,
        ]) {
            expect(
                resolvePublishedAt({
                    status: 'published',
                    given: undefined,
                    current,
                    now,
                })
            ).toBe(now);
        }
    });

    it('unpublishing clears the date', () => {
        expect(
            resolvePublishedAt({
                status: 'unpublished',
                given: undefined,
                current: row('published', past),
                now,
            })
        ).toBeNull();
    });

    it('scheduling keeps the row date', () => {
        expect(
            resolvePublishedAt({
                status: 'scheduled',
                given: undefined,
                current: row('scheduled', future),
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
                current: row('published', past),
                now,
            })
        ).toBeUndefined();
    });
});
