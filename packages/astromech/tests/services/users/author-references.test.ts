/**
 * Deleting a user nulls their author references across the entry tables.
 *
 * `createdBy`/`updatedBy` are `ON DELETE set null` FKs, but libSQL does not
 * enforce foreign keys at runtime, so `deleteUser` clears them itself. This pins
 * that clearing, and that a different user's authorship is left untouched.
 */

import type { Db } from '@/database/types';
import { createTestDb, createTestUser, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { createRepository } from '@/database/repository/create-repository';
import { entriesTable, entryContentTable, entryVersionsTable } from '@/database/tables';
import { usersService } from '@/users/service';

let db: Db;

beforeEach(async () => {
    db = await createTestDb();
    setupTestConfig();
});

describe('deleteUser author-reference clearing', () => {
    it('nulls the departed user’s createdBy/updatedBy across entry tables', async () => {
        const author = await createTestUser(db, { name: 'Author', email: 'a@test.dev' });
        const other = await createTestUser(db, { name: 'Other', email: 'o@test.dev' });

        const entries = createRepository(entriesTable, db);
        const contents = createRepository(entryContentTable, db);
        const versions = createRepository(entryVersionsTable, db);

        const entry = await entries.create({
            type: 'post',
            createdBy: author.id,
            updatedBy: author.id,
        });
        const content = await contents.create({
            entryId: entry.id,
            type: 'post',
            locale: 'en',
            title: 'Authored',
            createdBy: author.id,
            updatedBy: author.id,
        });
        const version = await versions.create({
            contentId: content.id,
            version: 1,
            title: 'Authored',
            fields: {},
            createdBy: author.id,
        });
        const otherEntry = await entries.create({
            type: 'post',
            createdBy: other.id,
            updatedBy: other.id,
        });
        const otherContent = await contents.create({
            entryId: otherEntry.id,
            type: 'post',
            locale: 'en',
            title: 'Other',
            createdBy: other.id,
            updatedBy: other.id,
        });

        await usersService.delete({ id: author.id });

        expect(await entries.findOne({ id: entry.id })).toMatchObject({
            createdBy: null,
            updatedBy: null,
        });
        expect(await contents.findOne({ id: content.id })).toMatchObject({
            createdBy: null,
            updatedBy: null,
        });
        expect(await versions.findOne({ id: version.id })).toMatchObject({
            createdBy: null,
        });

        // A different user's authorship is untouched.
        expect(await entries.findOne({ id: otherEntry.id })).toMatchObject({
            createdBy: other.id,
            updatedBy: other.id,
        });
        expect(await contents.findOne({ id: otherContent.id })).toMatchObject({
            createdBy: other.id,
            updatedBy: other.id,
        });
    });
});
