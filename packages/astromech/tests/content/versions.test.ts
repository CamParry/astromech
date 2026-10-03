/**
 * `snapshotVersion` credits the user it is handed. The author is a parameter,
 * so these run with no request, no database and no config.
 */

import type { ContentRowId } from '@/content/repository/types';
import type { WriteGuard } from '@/content/write-guard';
import type { User } from '@/types/index';
import { describe, expect, it } from 'vitest';
import { changesVersionedContent, snapshotVersion } from '@/content/versions';

const contentId = 'content-1' as ContentRowId;

/** A repository that records each snapshot it is asked to write. */
function recordingRepository() {
    const written: { guard: WriteGuard; createdBy: string | null }[] = [];
    return {
        written,
        repository: {
            versions: {
                snapshot: (guard: WriteGuard, createdBy: string | null) => {
                    written.push({ guard, createdBy });
                    return Promise.resolve(true);
                },
            },
            explainConflict: () => Promise.resolve(null),
        },
    };
}

const editor: User = {
    id: 'user-1',
    email: 'editor@example.com',
    name: 'Editor',
    emailVerified: true,
    image: null,
    locale: 'en',
    locales: ['en'],
    fields: {},
    role: 'editor',
    createdAt: new Date(),
    updatedAt: new Date(),
};

const address = { id: 'site', locale: 'en' };

describe('snapshotVersion', () => {
    it('credits the user it is given', async () => {
        const { repository, written } = recordingRepository();

        await snapshotVersion('global', repository, { contentId }, editor, address);

        expect(written).toEqual([{ guard: { contentId }, createdBy: 'user-1' }]);
    });

    it('credits nobody when given null', async () => {
        const { repository, written } = recordingRepository();

        await snapshotVersion('global', repository, { contentId }, null, address);

        expect(written[0]?.createdBy).toBeNull();
    });
});

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
