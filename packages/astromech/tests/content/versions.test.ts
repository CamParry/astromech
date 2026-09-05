/**
 * `snapshotVersion` credits the user it is handed, and nothing else. The author
 * used to come from the request store; it is now a parameter, so these run with
 * no request, no database and no config.
 */

import type {
    ContentRowId,
    ContentVersions,
    NewVersionSnapshot,
} from '@/content/repository/types';
import type { User } from '@/types/index';
import { describe, expect, it } from 'vitest';
import { snapshotVersion } from '@/content/versions';

const contentId = 'content-1' as ContentRowId;

/** A versions handle that records what it was asked to write. */
function recordingVersions(latestNumber = 0): {
    versions: ContentVersions;
    written: NewVersionSnapshot[];
} {
    const written: NewVersionSnapshot[] = [];
    return {
        written,
        versions: {
            list: () => Promise.resolve([]),
            get: () => Promise.resolve(null),
            create: (snapshot) => {
                written.push(snapshot);
                return Promise.resolve();
            },
            latestNumber: () => Promise.resolve(latestNumber),
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

describe('snapshotVersion', () => {
    it('credits the user it is given', async () => {
        const { versions, written } = recordingVersions(2);

        await snapshotVersion(versions, { contentId, fields: { title: 'Hi' } }, editor);

        expect(written).toHaveLength(1);
        expect(written[0]).toMatchObject({
            contentId,
            version: 3,
            fields: { title: 'Hi' },
            createdBy: 'user-1',
        });
    });

    it('credits nobody when given null', async () => {
        const { versions, written } = recordingVersions();

        await snapshotVersion(versions, { contentId, fields: {} }, null);

        expect(written[0]?.createdBy).toBeNull();
        expect(written[0]?.version).toBe(1);
    });

    it('writes the resource’s own snapshot columns from `extra`', async () => {
        const { versions, written } = recordingVersions();

        await snapshotVersion(versions, { contentId, fields: {} }, editor, {
            title: 'Post',
            slug: 'post',
        });

        expect(written[0]).toMatchObject({ title: 'Post', slug: 'post' });
    });
});
