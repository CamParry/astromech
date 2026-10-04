/**
 * `changesVersionedContent` decides whether an update writes a version. Who a
 * version is credited to is checked over every resource in `resource-versions.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { changesVersionedContent } from '@/content/versions';

describe('changesVersionedContent', () => {
    it('sees a change to a versioned column', () => {
        const current = { fields: {}, title: 'A', alt: null };
        expect(changesVersionedContent('media', current, { alt: 'B' })).toBe(true);
    });

    it('ignores a column the resource config does not version', () => {
        const current = { fields: {}, status: 'unpublished' };
        expect(
            changesVersionedContent('entry', current, {
                status: 'published',
            })
        ).toBe(false);
    });
});
