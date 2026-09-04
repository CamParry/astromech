/**
 * The relationship index over a translatable user.
 *
 * The index is keyed on the user, not on one of their content rows, so every
 * locale contributes: a write to `fr` must not replace `en`'s edges with its
 * own, and a rebuild must derive exactly what the write path stored.
 */

import type { DB } from '@/database/types';
import type { AstromechConfig } from '@/types/index';
import type { Kysely } from 'kysely';
import { createTestDb, setupTestConfig } from '@tests/harness';
import { beforeEach, describe, expect, it } from 'vitest';
import { encodeWith } from '@/database/codec';
import { createRelationshipRepository } from '@/database/repository/relationships';
import { usersTable } from '@/database/tables';
import { entriesService } from '@/entries/service';
import { DEFAULT_ROLE_SLUG } from '@/permissions/roles';
import { rebuildRelationshipIndex } from '@/transport/cli/relationship-index';
import { usersService } from '@/users/service';
import { makeTranslatableUsersConfig } from './users-config';

/** Two locales, and one per-locale relationship field on users. */
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
let id: string;
let postA: string;
let postB: string;

beforeEach(async () => {
    db = await createTestDb();
    setupTestConfig(makeConfig());
    postA = (await entriesService.create({ type: 'post', data: { title: 'A' } })).id;
    postB = (await entriesService.create({ type: 'post', data: { title: 'B' } })).id;
    id = (await usersService.create({ data: { email: 'a@test.dev', name: 'Ann' } })).id;
});

/** The user's index rows, ordered by target so two runs compare directly. */
async function credits(): Promise<string[]> {
    const rows = await createRelationshipRepository().findBySource(id, 'user');
    return rows.map((row) => row.targetId).sort();
}

/** The account row alone — no content row, as better-auth's own insert leaves. */
async function insertAccountOnlyUser(): Promise<string> {
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

describe('user relationships across locales', () => {
    it('indexes every locale of one user', async () => {
        await usersService.update({ id, data: { fields: { credit: postA } } });
        await usersService.update({
            id,
            locale: 'fr',
            data: { fields: { credit: postB } },
        });

        expect(await credits()).toEqual([postA, postB].sort());
    });

    it('keeps the other locale’s edge when one locale drops its reference', async () => {
        await usersService.update({ id, data: { fields: { credit: postA } } });
        await usersService.update({
            id,
            locale: 'fr',
            data: { fields: { credit: postB } },
        });

        await usersService.update({
            id,
            locale: 'fr',
            data: { fields: { credit: null } },
        });

        expect(await credits()).toEqual([postA]);
    });

    it('rebuilds to exactly the rows the write path stored', async () => {
        await usersService.update({ id, data: { fields: { credit: postA } } });
        await usersService.update({
            id,
            locale: 'fr',
            data: { fields: { credit: postB } },
        });
        const written = (await createRelationshipRepository().findAll()).sort((a, b) =>
            JSON.stringify(a).localeCompare(JSON.stringify(b))
        );

        await rebuildRelationshipIndex();

        const rebuilt = (await createRelationshipRepository().findAll()).sort((a, b) =>
            JSON.stringify(a).localeCompare(JSON.stringify(b))
        );
        expect(rebuilt).toEqual(written);
    });

    it('gives a user with no content row a source with no edges', async () => {
        const noContentId = await insertAccountOnlyUser();

        await rebuildRelationshipIndex();

        const rows = await createRelationshipRepository().findBySource(
            noContentId,
            'user'
        );
        expect(rows).toEqual([]);
    });
});
