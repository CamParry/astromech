/**
 * Every resource's service is a definition the same way: its catalogue holds
 * exactly the service's methods, each stamped with its id and declaring what
 * it demands, and `bind(ctx)` writes as the context's user with no request
 * store in play. What each method declares is the resource's row below.
 */

import type { AppContext, ResourceType } from '@/types/index';
import { adminRole } from '@tests/fixtures';
import {
    createTestDb,
    createTestUser,
    makeTestConfig,
    setupTestConfig,
} from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAppContext } from '@/app-context/app-context';
import { RESOURCE_TYPES } from '@/content/resource-types';
import { getDb } from '@/database/registry';
import { createRepository } from '@/database/repository/create-repository';
import { entriesDefinition } from '@/entries/service';
import { globalsDefinition } from '@/globals/service';
import { mediaDefinition } from '@/media/service';
import { usersDefinition } from '@/users/service';
import { userContentTable } from '@/users/tables';

/** Who a write recorded as its author and its last editor. */
type Authorship = { createdBy: string | null; updatedBy: string | null };

/** One resource's definition, what it declares, and a write through `bind`. */
type Row = {
    catalogue: Record<string, { name: string; access?: unknown; requires?: unknown }>;
    /** The id prefix each method is stamped with. */
    prefix: string;
    /**
     * What each method declares, under one key: the permission it demands
     * (`access`), or the capability the type or global must carry (`requires`,
     * absent for none) where the permission depends on the call.
     */
    declares: 'access' | 'requires';
    declared: Record<string, string | undefined>;
    /** Write one through the definition bound to `ctx`; answer its authorship. */
    writeAs(ctx: AppContext): Promise<Authorship>;
};

const ROWS: Record<ResourceType, Row> = {
    entry: {
        catalogue: entriesDefinition.catalogue,
        prefix: 'entries',
        declares: 'requires',
        declared: {
            query: undefined,
            count: undefined,
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
            getVersion: 'versioning',
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
        },
        writeAs: (ctx) =>
            entriesDefinition
                .bind(ctx)
                .create({ type: 'post', data: { title: 'Bound' } }),
    },
    global: {
        catalogue: globalsDefinition.catalogue,
        prefix: 'globals',
        declares: 'requires',
        declared: {
            get: undefined,
            update: undefined,
            publish: 'statuses',
            unpublish: 'statuses',
            schedule: 'statuses',
            versions: 'versioning',
            getVersion: 'versioning',
            restoreVersion: 'versioning',
            createStaged: 'staging',
            getStaged: 'staging',
            mergeStaged: 'staging',
            deleteStaged: 'staging',
        },
        writeAs: (ctx) =>
            globalsDefinition.bind(ctx).update({
                key: 'contact',
                data: { fields: { email: 'hi@example.dev' } },
            }),
    },
    user: {
        catalogue: usersDefinition.catalogue,
        prefix: 'users',
        declares: 'access',
        declared: {
            query: 'users:read',
            get: 'users:read',
            create: 'users:create',
            update: 'users:update',
            delete: 'users:delete',
            versions: 'users:read',
            getVersion: 'users:read',
            restoreVersion: 'users:update',
        },
        async writeAs(ctx) {
            const created = await usersDefinition
                .bind(ctx)
                .create({ data: { email: 'new@test.dev', name: 'New' } });
            return userAuthorship(created.id);
        },
    },
    media: {
        catalogue: mediaDefinition.catalogue,
        prefix: 'media',
        declares: 'access',
        declared: {
            query: 'media:read',
            get: 'media:read',
            upload: 'media:upload',
            update: 'media:update',
            delete: 'media:delete',
            replace: 'media:upload',
            usedBy: 'media:read',
            versions: 'media:read',
            getVersion: 'media:read',
            restoreVersion: 'media:update',
        },
        writeAs: (ctx) =>
            mediaDefinition
                .bind(ctx)
                .upload({ file: new File(['x'], 'a.txt', { type: 'text/plain' }) }),
    },
};

/** The authorship stamped on one user's content row, which `User` does not carry. */
async function userAuthorship(userId: string): Promise<Authorship> {
    const row = await createRepository(userContentTable, getDb()).findOne({ userId });
    if (!row) throw new Error(`no content row for user ${userId}`);
    return { createdBy: row.createdBy, updatedBy: row.updatedBy };
}

beforeEach(async () => {
    await createTestDb();
    setupTestConfig({
        ...makeTestConfig(),
        globals: [
            {
                key: 'contact',
                label: 'Contact',
                fields: [{ name: 'email', type: 'text', label: 'Email' }],
            },
        ],
    });
});

describe.each(RESOURCE_TYPES)('%s', (kind) => {
    const row = ROWS[kind];

    describe('the catalogue', () => {
        it('holds exactly the service’s methods, each stamped with its id', () => {
            expect(Object.keys(row.catalogue).sort()).toEqual(
                Object.keys(row.declared).sort()
            );
            for (const [key, method] of Object.entries(row.catalogue)) {
                expect(method.name, key).toBe(`${row.prefix}.${key}`);
            }
        });

        it('declares what each method demands', () => {
            for (const [key, declared] of Object.entries(row.declared)) {
                expect(row.catalogue[key]?.[row.declares], key).toBe(declared);
            }
        });
    });

    it('binds to write as the context’s user, with no request store in play', async () => {
        const author = await createTestUser(getDb(), { name: 'Author' });
        const ctx = createAppContext({ user: author, role: adminRole });

        expect(await row.writeAs(ctx)).toMatchObject({
            createdBy: author.id,
            updatedBy: author.id,
        });
    });
});
