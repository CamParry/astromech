/**
 * `versionedMediaUrl`, which tags a media original's URL so a replaced file is
 * fetched again: with the file's content hash when it has one, else with
 * `updatedAt`.
 */

import { describe, expect, it } from 'vitest';
import { versionedMediaUrl } from '@/admin/utilities/media';

const updatedAt = new Date('2026-09-01T12:00:00.000Z');

describe('versionedMediaUrl', () => {
    it('tags the URL with the content hash', () => {
        expect(
            versionedMediaUrl({
                url: '/media/a.png',
                updatedAt,
                metadata: { version: 'abc123def456' },
            })
        ).toBe('/media/a.png?v=abc123def456');
    });

    it('falls back to updatedAt when the file has no hash', () => {
        expect(
            versionedMediaUrl({ url: '/media/a.pdf', updatedAt, metadata: null })
        ).toBe(`/media/a.pdf?v=${String(updatedAt.getTime())}`);
    });

    it('appends to a URL that already has a query', () => {
        expect(
            versionedMediaUrl({
                url: '/media/a.png?sig=1',
                updatedAt,
                metadata: { version: 'abc123def456' },
            })
        ).toBe('/media/a.png?sig=1&v=abc123def456');
    });

    it('leaves the URL alone when there is neither', () => {
        expect(
            versionedMediaUrl({
                url: '/media/a.pdf',
                updatedAt: new Date('not a date'),
                metadata: {},
            })
        ).toBe('/media/a.pdf');
    });
});
