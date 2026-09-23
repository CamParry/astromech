/**
 * The entries service as a definition: what the shared catalogue declares, what
 * one entry type's catalogue fixes, and that `bind(ctx)` runs a handler as the
 * context's user with no request store in play.
 */

import type { EntriesService, Entry, Role } from '@/types/index';
import {
    createTestDb,
    createTestUser,
    makeTestConfig,
    setupTestConfig,
} from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAppContext } from '@/app-context/app-context';
import { getDb } from '@/database/registry';
import { entryCatalogue } from '@/entries/catalogue';
import { entriesDefinition } from '@/entries/service';

const admin: Role = {
    slug: 'admin',
    name: 'Admin',
    permissions: ['*'],
    isBuiltIn: true,
};

/** The capability each method needs the entry type to declare; absent means none. */
const REQUIRES: Record<keyof EntriesService, string | undefined> = {
    query: undefined,
    get: undefined,
    create: undefined,
    update: undefined,
    delete: undefined,
    duplicate: undefined,
    usedBy: undefined,
    trash: 'trash',
    restore: 'trash',
    emptyTrash: 'trash',
    versions: 'versioning',
    restoreVersion: 'versioning',
    publish: 'statuses',
    unpublish: 'statuses',
    schedule: 'statuses',
    createStaged: 'staging',
    getStaged: 'staging',
    mergeStaged: 'staging',
    deleteStaged: 'staging',
    issuePreviewToken: 'staging',
    revokePreviewToken: 'staging',
};

/** The permission one entry type's catalogue fixes each method to. */
const PERMISSIONS: Record<keyof EntriesService, string> = {
    query: 'entry:posts:read',
    get: 'entry:posts:read',
    create: 'entry:posts:create',
    update: 'entry:posts:update',
    delete: 'entry:posts:delete',
    duplicate: 'entry:posts:create',
    usedBy: 'entry:posts:read',
    trash: 'entry:posts:delete',
    restore: 'entry:posts:update',
    emptyTrash: 'entry:posts:delete',
    versions: 'entry:posts:read',
    restoreVersion: 'entry:posts:update',
    publish: 'entry:posts:publish',
    unpublish: 'entry:posts:publish',
    schedule: 'entry:posts:publish',
    createStaged: 'entry:posts:update',
    getStaged: 'entry:posts:read',
    // Merging a staged change is what makes it live — enforced as a publish even
    // though the capability gating it is `staging`.
    mergeStaged: 'entry:posts:publish',
    deleteStaged: 'entry:posts:update',
    issuePreviewToken: 'entry:posts:update',
    revokePreviewToken: 'entry:posts:update',
};

beforeEach(async () => {
    await createTestDb();
    setupTestConfig(makeTestConfig());
});

describe('the catalogue', () => {
    it('holds exactly the EntriesService methods, each stamped with its id', () => {
        expect(Object.keys(entriesDefinition.catalogue).sort()).toEqual(
            Object.keys(REQUIRES).sort()
        );
        for (const [key, method] of Object.entries(entriesDefinition.catalogue)) {
            expect(method.name, key).toBe(`entries.${key}`);
        }
    });

    it('declares the capability each method needs the type to carry', () => {
        for (const [key, requires] of Object.entries(REQUIRES)) {
            const method = entriesDefinition.catalogue[key as keyof EntriesService];
            expect(method.requires, key).toBe(requires);
        }
    });
});

describe('entryCatalogue', () => {
    it('keys one type’s catalogue as the definition keys its methods', () => {
        expect(
            Object.keys(entryCatalogue({ typeId: 'posts', titled: true })).sort()
        ).toEqual(Object.keys(entriesDefinition.catalogue).sort());
    });

    it('fixes every method’s access to that type’s permission', () => {
        const catalogue = entryCatalogue({ typeId: 'posts', titled: true });

        for (const [key, permission] of Object.entries(PERMISSIONS)) {
            expect(catalogue[key as keyof EntriesService].access, key).toBe(permission);
        }
    });

    it('fixes a plugin type’s access to the plugin permission form', () => {
        const catalogue = entryCatalogue({ typeId: 'redirects/redirect', titled: true });

        expect(catalogue.update.access).toBe('plugin:redirects:entry:redirect:update');
        expect(catalogue.update.summary).toBe(
            'Update a "redirects/redirect" entry. Fields merge: omitted fields keep their ' +
                'current value, and arrays are replaced whole.'
        );
    });
});

describe('bind', () => {
    it('writes the context’s user, with no request store in play', async () => {
        const author = await createTestUser(getDb());
        const ctx = createAppContext({ user: { id: author.id } as never, role: admin });

        const entry = await entriesDefinition
            .bind(ctx)
            .create({ type: 'post', data: { title: 'Bound' } });

        expect(entry.createdBy).toBe(author.id);
        expect(entry.updatedBy).toBe(author.id);
    });

    it('answers one entry for one id and a list for a list', async () => {
        const ctx = createAppContext({ user: null, role: admin });
        const entries = entriesDefinition.bind(ctx);

        const first = (await entries.create({
            type: 'post',
            data: { title: 'First' },
        })) as Entry;
        const second = (await entries.create({
            type: 'post',
            data: { title: 'Second' },
        })) as Entry;

        const one = await entries.update({
            type: 'post',
            id: first.id,
            data: { title: 'One' },
        });
        const many = await entries.update({
            type: 'post',
            id: [first.id, second.id],
            data: { title: 'Many' },
        });

        expect(Array.isArray(one)).toBe(false);
        expect((one as Entry).title).toBe('One');
        expect(Array.isArray(many)).toBe(true);
        expect((many as Entry[]).map((entry) => entry.title)).toEqual(['Many', 'Many']);
    });
});
