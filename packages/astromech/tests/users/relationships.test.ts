/**
 * The relationship index over a user with no content row, which only a user can
 * be. The rules users share with media are in
 * `tests/content/resource-translation.test.ts`.
 */

import type { DB } from '@/database/types';
import type { AstromechConfig } from '@/types/index';
import type { Kysely } from 'kysely';
import { createTestDb, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { relationshipRepository } from '@/content/repository/relationships';
import { encodeWith } from '@/database/codec';
import { usersTable } from '@/database/tables';
import { DEFAULT_ROLE_SLUG } from '@/permissions/roles';
import { rebuildRelationshipIndex } from '@/transport/cli/relationship-index';
import { makeTranslatableUsersConfig } from './users-config';

/** One per-locale relationship field on users. */
function makeConfig(): AstromechConfig {
    const config = makeTranslatableUsersConfig();
    return {
        ...config,
        users: {
            ...config.users,
            fields: [
                { name: 'credit', type: 'relationship', label: 'Credit', target: 'post' },
            ],
        },
    };
}

let db: Kysely<DB>;

beforeEach(async () => {
    db = await createTestDb();
    setupTestConfig(makeConfig());
});

/** The `users` row alone, with no content row. */
async function insertUserRowOnly(): Promise<string> {
    const row = await db
        .insertInto('users')
        .values(
            encodeWith(usersTable, {
                email: 'noprofile@test.dev',
                name: 'No Profile',
                role: DEFAULT_ROLE_SLUG,
            })
        )
        .returningAll()
        .executeTakeFirstOrThrow();
    return String(row.id);
}

describe('user relationships', () => {
    it('gives a user with no content row a source with no references', async () => {
        const noContentId = await insertUserRowOnly();

        await rebuildRelationshipIndex();

        const rows = await relationshipRepository.findBySource(noContentId, 'user');
        expect(rows).toEqual([]);
    });
});
