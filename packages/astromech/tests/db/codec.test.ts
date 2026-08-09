/**
 * Row codec — the table-name-keyed tier.
 *
 * Since the `Table`-keyed `*With` functions became the only path for the
 * tables we own, `decode`/`encode`/`encodePatch` exist for exactly two things:
 * the 4 better-auth tables (no `Table`, ever) and plugin tables reached by
 * name. `users` is the one with a non-trivial column mix, so it stands in for
 * the four here — and better-auth's format is the point: seconds-INTEGER
 * timestamps, not the ISO-TEXT our tables emit. Getting that wrong breaks
 * login, so the assertions go down to the stored cells rather than stopping at
 * the round trip.
 *
 * Asserted against a real row (temp-file libsql via the harness) so the DDL's
 * `integer` columns participate — a pure-function round trip would pass even if
 * the codec and the baseline migration disagreed.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import type { Insertable } from 'kysely';
import { createTestDb } from '@tests/harness';
import { decode, encode, encodePatch } from '@/database/codec';
import type { DB, Db } from '@/database/types';
import type { UserRow } from '@/users/schema';

const CREATED = new Date('2024-03-04T05:06:07.000Z');

let db: Db;

beforeEach(async () => {
    db = await createTestDb();
});

/**
 * The cells as SQLite holds them, bypassing the codec. Keys still come back
 * camelCase — `CamelCasePlugin` maps result columns too, so this sidesteps the
 * value conversion only, which is exactly what is under test.
 */
async function storedUser(id: string): Promise<Record<string, unknown>> {
    const { rows } = await sql<
        Record<string, unknown>
    >`SELECT * FROM users WHERE id = ${id}`.execute(db);
    const row = rows[0];
    expect(row).toBeDefined();
    return row as Record<string, unknown>;
}

describe('legacy (better-auth) tables – encode/decode round trip', () => {
    it('round-trips a users row: Date timestamps, boolean flag, parsed json', async () => {
        const inserted = await db
            .insertInto('users')
            .values(
                encode('users', {
                    email: 'legacy@test.dev',
                    name: 'Legacy User',
                    emailVerified: true,
                    fields: { bio: 'hi', tags: ['a', 'b'] },
                    roleSlug: 'admin',
                    createdAt: CREATED,
                    updatedAt: CREATED,
                }) as unknown as Insertable<DB['users']>
            )
            .returningAll()
            .executeTakeFirstOrThrow();

        const user = decode('users', inserted) as unknown as UserRow;

        expect(user.email).toBe('legacy@test.dev');
        expect(user.name).toBe('Legacy User');
        expect(user.emailVerified).toBe(true);
        expect(user.fields).toEqual({ bio: 'hi', tags: ['a', 'b'] });
        expect(user.roleSlug).toBe('admin');
        expect(user.createdAt).toBeInstanceOf(Date);
        expect(user.createdAt.getTime()).toBe(CREATED.getTime());
        expect(user.updatedAt).toBeInstanceOf(Date);
        expect(user.updatedAt.getTime()).toBe(CREATED.getTime());
        // `id` is minted app-side (uuid, not our ULID) because better-auth's
        // schema has no DB default for it.
        expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('stores timestamps as SECONDS and the flag as 0/1 — the format better-auth owns', async () => {
        const inserted = await db
            .insertInto('users')
            .values(
                encode('users', {
                    email: 'seconds@test.dev',
                    name: 'Seconds',
                    emailVerified: false,
                    createdAt: CREATED,
                    updatedAt: CREATED,
                }) as unknown as Insertable<DB['users']>
            )
            .returningAll()
            .executeTakeFirstOrThrow();

        const stored = await storedUser(inserted.id);
        expect(stored.createdAt).toBe(Math.floor(CREATED.getTime() / 1000));
        expect(stored.emailVerified).toBe(0);
        // json is TEXT even when absent from the write — nothing invents `{}`.
        expect(stored.fields).toBeNull();
    });

    it('encode injects id/createdAt/updatedAt when omitted; encodePatch never does', async () => {
        const inserted = await db
            .insertInto('users')
            .values(
                encode('users', {
                    email: 'defaults@test.dev',
                    name: 'Defaults',
                }) as unknown as Insertable<DB['users']>
            )
            .returningAll()
            .executeTakeFirstOrThrow();

        const user = decode('users', inserted) as unknown as UserRow;
        expect(user.id).not.toBe('');
        expect(user.createdAt).toBeInstanceOf(Date);
        expect(user.updatedAt).toBeInstanceOf(Date);

        // A patch of the same columns adds nothing of its own.
        expect(encodePatch('users', { name: 'Renamed' })).toEqual({ name: 'Renamed' });
    });
});
