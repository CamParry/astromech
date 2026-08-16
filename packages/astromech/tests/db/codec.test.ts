/**
 * Row codec — the table-name-keyed tier.
 *
 * Since the `Table`-keyed `*With` functions became the only path for the tables
 * we own, `decode`/`encode`/`encodePatch` exist for exactly two things:
 * `sessions`/`accounts`/`verifications` (no descriptor, because nothing of ours
 * writes them) and plugin tables reached by name. `accounts` stands in for the
 * three here, and better-auth's format is the point: ISO-8601 TEXT timestamps,
 * the format its own adapter writes. Getting that wrong breaks login, so the
 * assertions go down to the stored cells rather than stopping at the round trip.
 *
 * Asserted against a real row (temp-file libsql via the harness) so the DDL
 * participates — a pure-function round trip would pass even if the codec and
 * the baseline migration disagreed.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import type { Insertable } from 'kysely';
import { createTestDb, createTestUser } from '@tests/harness';
import { decode, encode, encodePatch } from '@/database/codec';
import type { DB, Db } from '@/database/types';

const CREATED = new Date('2024-03-04T05:06:07.000Z');
const EXPIRES = new Date('2024-04-05T06:07:08.000Z');

let db: Db;

beforeEach(async () => {
    db = await createTestDb();
});

/**
 * The cells as SQLite holds them, bypassing the codec. Keys still come back
 * camelCase — `CamelCasePlugin` maps result columns too, so this sidesteps the
 * value conversion only, which is exactly what is under test.
 */
async function storedAccount(id: string): Promise<Record<string, unknown>> {
    const { rows } = await sql<
        Record<string, unknown>
    >`SELECT * FROM accounts WHERE id = ${id}`.execute(db);
    const row = rows[0];
    expect(row).toBeDefined();
    return row as Record<string, unknown>;
}

/** `accounts.user_id` is a FK, so every row here needs a user to point at. */
async function insertAccount(
    values: Record<string, unknown>
): Promise<Record<string, unknown>> {
    const user = await createTestUser(db);
    return db
        .insertInto('accounts')
        .values(
            encode('accounts', {
                id: crypto.randomUUID(),
                accountId: user.id,
                providerId: 'credential',
                userId: user.id,
                createdAt: CREATED,
                updatedAt: CREATED,
                ...values,
            }) as unknown as Insertable<DB['accounts']>
        )
        .returningAll()
        .executeTakeFirstOrThrow();
}

describe('better-auth tables – encode/decode round trip', () => {
    it('round-trips an accounts row: Date timestamps in, Date timestamps out', async () => {
        const inserted = await insertAccount({ accessTokenExpiresAt: EXPIRES });
        const account = decode('accounts', inserted);

        expect(account.createdAt).toBeInstanceOf(Date);
        expect((account.createdAt as Date).getTime()).toBe(CREATED.getTime());
        expect((account.accessTokenExpiresAt as Date).getTime()).toBe(EXPIRES.getTime());
        // Nothing invents a value for a column the write left out.
        expect(account.refreshTokenExpiresAt).toBeNull();
    });

    it('stores timestamps as ISO TEXT — the format better-auth writes', async () => {
        const inserted = await insertAccount({});

        const stored = await storedAccount(String(inserted.id));
        expect(stored.createdAt).toBe(CREATED.toISOString());
        expect(stored.updatedAt).toBe(CREATED.toISOString());
    });

    // Rows predating that understanding hold unix seconds; they still decode.
    it('decodes a unix-seconds timestamp left by an older writer', () => {
        const decoded = decode('accounts', {
            createdAt: Math.floor(CREATED.getTime() / 1000),
        });
        expect(decoded.createdAt).toEqual(CREATED);
    });

    it('encodePatch serializes what it is given and injects nothing', () => {
        expect(encodePatch('accounts', { scope: 'read', updatedAt: CREATED })).toEqual({
            scope: 'read',
            updatedAt: CREATED.toISOString(),
        });
    });

    it('passes a name it knows nothing about straight through, minus undefined keys', () => {
        expect(encode('mystery', { a: 1, b: undefined })).toEqual({ a: 1 });
    });
});
