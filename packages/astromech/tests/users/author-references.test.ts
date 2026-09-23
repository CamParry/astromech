/**
 * Deleting a user nulls their author references across every table that carries
 * one, not just the entry tables.
 *
 * `createdBy`/`updatedBy` are `ON DELETE set null` foreign keys, and libSQL and
 * D1 both enforce foreign keys, so the database clears them when the user row
 * goes. This pins the schema's `set null` table by table, and that a different
 * user's authorship is left untouched.
 */

import type { Db } from '@/database/types';
import { createTestDb, createTestUser, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { currentServices } from '@/app-context/services';
import { createRepository } from '@/database/repository/create-repository';
import {
    entriesTable,
    entryContentTable,
    entryVersionsTable,
    globalContentTable,
    globalsTable,
    globalVersionsTable,
    mediaContentTable,
    mediaTable,
    mediaVersionsTable,
    userContentTable,
    userVersionsTable,
} from '@/database/tables';

const usersService = currentServices.users;

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
    it('nulls them on globals, media and another user’s rows too', async () => {
        const author = await createTestUser(db, { name: 'Author', email: 'a@test.dev' });
        const other = await createTestUser(db, { name: 'Other', email: 'o@test.dev' });

        const globals = createRepository(globalsTable, db);
        const globalContents = createRepository(globalContentTable, db);
        const globalVersions = createRepository(globalVersionsTable, db);
        const media = createRepository(mediaTable, db);
        const mediaContents = createRepository(mediaContentTable, db);
        const mediaVersions = createRepository(mediaVersionsTable, db);
        const userContents = createRepository(userContentTable, db);
        const userVersions = createRepository(userVersionsTable, db);

        const global = await globals.create({
            key: 'site',
            createdBy: author.id,
            updatedBy: author.id,
        });
        const globalContent = await globalContents.create({
            globalId: global.id,
            locale: 'en',
            createdBy: author.id,
            updatedBy: author.id,
        });
        const globalVersion = await globalVersions.create({
            contentId: globalContent.id,
            version: 1,
            fields: {},
            createdBy: author.id,
        });
        const item = await media.create({
            filename: 'photo.png',
            mimeType: 'image/png',
            size: 1,
            createdBy: author.id,
            updatedBy: author.id,
        });
        const mediaContent = await mediaContents.create({
            mediaId: item.id,
            locale: 'en',
            createdBy: author.id,
            updatedBy: author.id,
        });
        const mediaVersion = await mediaVersions.create({
            contentId: mediaContent.id,
            version: 1,
            fields: {},
            createdBy: author.id,
        });

        // The other user's profile, authored by the user being deleted.
        const otherContent = await userContents.findOne({ userId: other.id });
        if (!otherContent) throw new Error('expected the other user to have content');
        await userContents.update(otherContent.id, {
            createdBy: author.id,
            updatedBy: author.id,
        });
        const otherVersion = await userVersions.create({
            contentId: otherContent.id,
            version: 1,
            fields: {},
            createdBy: author.id,
        });

        await usersService.delete({ id: author.id });

        expect(await globals.findOne({ id: global.id })).toMatchObject({
            createdBy: null,
            updatedBy: null,
        });
        expect(await globalContents.findOne({ id: globalContent.id })).toMatchObject({
            createdBy: null,
            updatedBy: null,
        });
        expect(await globalVersions.findOne({ id: globalVersion.id })).toMatchObject({
            createdBy: null,
        });
        expect(await media.findOne({ id: item.id })).toMatchObject({
            createdBy: null,
            updatedBy: null,
        });
        expect(await mediaContents.findOne({ id: mediaContent.id })).toMatchObject({
            createdBy: null,
            updatedBy: null,
        });
        expect(await mediaVersions.findOne({ id: mediaVersion.id })).toMatchObject({
            createdBy: null,
        });
        expect(await userContents.findOne({ id: otherContent.id })).toMatchObject({
            userId: other.id,
            createdBy: null,
            updatedBy: null,
        });
        expect(await userVersions.findOne({ id: otherVersion.id })).toMatchObject({
            createdBy: null,
        });
    });

    it('leaves a different user’s authorship untouched', async () => {
        const author = await createTestUser(db, { name: 'Author', email: 'a@test.dev' });
        const other = await createTestUser(db, { name: 'Other', email: 'o@test.dev' });

        const media = createRepository(mediaTable, db);
        const item = await media.create({
            filename: 'other.png',
            mimeType: 'image/png',
            size: 1,
            createdBy: other.id,
            updatedBy: other.id,
        });

        await usersService.delete({ id: author.id });

        expect(await media.findOne({ id: item.id })).toMatchObject({
            createdBy: other.id,
            updatedBy: other.id,
        });
    });
});
