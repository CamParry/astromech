/**
 * The entries service as a definition, beyond what every resource's shares
 * (`tests/content/resource-definition.test.ts`): what one entry type's
 * catalogue fixes, and a bound update answering one entry or a list.
 */

import type { EntriesService, Entry, Role } from '@/types/index';
import { createTestDb, makeTestConfig, setupTestConfig } from '@tests/harness';
import { inputKeys } from '@tests/strict-input';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAppContext } from '@/app-context/app-context';
import { entryCatalogue } from '@/entries/catalogue';
import { entriesDefinition } from '@/entries/service';

const admin: Role = {
    slug: 'admin',
    name: 'Admin',
    permissions: ['*'],
    isBuiltIn: true,
};

/** The permission one entry type's catalogue fixes each method to. */
const PERMISSIONS: Record<keyof EntriesService, string> = {
    query: 'entry:posts:read',
    count: 'entry:posts:read',
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
    getVersion: 'entry:posts:read',
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

    it('declares the same keys as each method’s own input, titled or not', () => {
        for (const titled of [true, false]) {
            const catalogue = entryCatalogue({ typeId: 'posts', titled });
            for (const [key, method] of Object.entries(entriesDefinition.catalogue)) {
                const own = inputKeys(method.input);
                expect(own.length, key).toBeGreaterThan(0);
                expect(
                    inputKeys(catalogue[key as keyof EntriesService].input),
                    key
                ).toEqual(own);
            }
        }
    });

    it('fixes a plugin type’s access to the plugin permission form', () => {
        const catalogue = entryCatalogue({ typeId: 'forms/form', titled: true });

        expect(catalogue.update.access).toBe('plugin:forms:entry:form:update');
        expect(catalogue.update.summary).toBe(
            'Update an entry. Fields merge: omitted fields keep their current ' +
                'value, and arrays are replaced whole. Entry type: "forms/form".'
        );
    });
});

describe('bind', () => {
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
            ids: [first.id, second.id],
            data: { title: 'Many' },
        });

        expect(Array.isArray(one)).toBe(false);
        expect((one as Entry).title).toBe('One');
        expect(Array.isArray(many)).toBe(true);
        expect((many as Entry[]).map((entry) => entry.title)).toEqual(['Many', 'Many']);
    });
});
