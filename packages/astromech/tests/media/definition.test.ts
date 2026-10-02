/**
 * The media service as a definition, beyond what every resource's shares
 * (`tests/content/resource-definition.test.ts`): two methods take binary input,
 * a sibling call acts as the same user, and an edit records its editor.
 */

import type { Role } from '@/types/index';
import {
    createTestDb,
    createTestUser,
    makeTestConfig,
    setupTestConfig,
} from '@tests/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppContext } from '@/app-context/app-context';
import { getDb } from '@/database/registry';
import { mediaDefinition } from '@/media/service';

const admin: Role = {
    slug: 'admin',
    name: 'Admin',
    permissions: ['*'],
    isBuiltIn: true,
};

/** The two methods whose input carries a `File`, which JSON cannot express. */
const BINARY = ['upload', 'replace'];

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeTestConfig());
});

describe('the catalogue', () => {
    it('flags the two methods a JSON transport cannot call, and no others', () => {
        for (const key of Object.keys(
            mediaDefinition.catalogue
        ) as (keyof typeof mediaDefinition.catalogue)[]) {
            const expected = BINARY.includes(key) ? true : undefined;
            expect(mediaDefinition.catalogue[key].binaryInput, key).toBe(expected);
        }
    });
});

describe('bind', () => {
    it('hands a sibling reached through ctx.media the same user', async () => {
        const author = await createTestUser(getDb(), { name: 'Author' });
        const ctx = createAppContext({ user: author, role: admin });

        const uploaded = await ctx.media.upload({
            file: new File(['x'], 'b.txt', { type: 'text/plain' }),
        });
        await ctx.media.update({ id: uploaded.id, data: { title: 'Titled' } });
        const read = await ctx.media.get({ id: uploaded.id });

        expect(read?.title).toBe('Titled');
        expect(read?.createdBy).toBe(author.id);
    });

    describe('a metadata edit', () => {
        afterEach(() => {
            vi.useRealTimers();
        });

        it('stamps the media row and records the editor as updatedBy', async () => {
            const author = await createTestUser(getDb(), { name: 'Author' });
            const editor = await createTestUser(getDb(), { name: 'Editor' });
            vi.useFakeTimers({ toFake: ['Date'] });
            vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
            const uploaded = await createAppContext({
                user: author,
                role: admin,
            }).media.upload({ file: new File(['x'], 'c.txt', { type: 'text/plain' }) });
            const later = new Date('2026-01-02T00:00:00.000Z');
            vi.setSystemTime(later);

            const edited = await createAppContext({
                user: editor,
                role: admin,
            }).media.update({ id: uploaded.id, data: { alt: 'Described' } });

            expect(edited.updatedAt).toEqual(later);
            expect(edited.updatedBy).toBe(editor.id);
            expect(edited.createdBy).toBe(author.id);
        });
    });
});
