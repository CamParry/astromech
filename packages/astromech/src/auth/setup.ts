/**
 * First-run setup: the write behind `POST /setup`, which creates the first
 * admin. One conditional insert is the gate, so concurrent calls on an empty
 * install create exactly one user without a lock or a transaction.
 */

import type { Db } from '@/database/types';
import type { BuiltInRoleSlug } from '@/permissions/roles';
import type { NewUserTableRow } from '@/users/tables';
import { z } from '@hono/zod-openapi';
import { hashPassword } from 'better-auth/crypto';
import { sql } from 'kysely';
import { getDefaultContentLocale } from '@/config/content-locale';
import { encodeWith } from '@/database/codec';
import { createRepository } from '@/database/repository/create-repository';
import { accountsTable, userContentTable, usersTable } from '@/database/tables';
import { transaction } from '@/database/transaction';

/** The refusal every closed sign-up path answers with. */
export const SIGN_UP_CLOSED = {
    code: 'SIGN_UP_CLOSED',
    message: 'Sign-up is closed. Ask an administrator to create your account.',
} as const;

/** The body `POST /setup` takes. Eight characters is Better Auth's own floor. */
export const firstAdminSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Must be a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
});

/**
 * Create the first admin, with its credential account and its default-locale
 * content row. Answers `'closed'` when a user already exists, having written
 * nothing.
 */
export async function createFirstAdmin(
    input: z.infer<typeof firstAdminSchema>
): Promise<'created' | 'closed'> {
    const id = crypto.randomUUID();
    const now = new Date();
    // Hashed before the transaction opens, so no lock is held while it runs.
    const password = await hashPassword(input.password);

    // libSQL runs the three writes as one transaction. D1 has no interactive
    // transactions, so there the first statement is the gate on its own: a
    // failure after it leaves an admin with no password, and
    // `astromech users:create` is how that install recovers.
    return transaction(async () => {
        const inserted = await insertFirstUser({
            id,
            email: input.email,
            name: input.name,
            emailVerified: true,
            role: 'admin' satisfies BuiltInRoleSlug,
        });
        if (!inserted) return 'closed';

        await createRepository(accountsTable).create({
            accountId: id,
            providerId: 'credential',
            userId: id,
            password,
            createdAt: now,
            updatedAt: now,
        });
        await createRepository(userContentTable).create({
            userId: id,
            locale: getDefaultContentLocale(),
            fields: {},
        });
        return 'created';
    });
}

/**
 * Insert the `users` row only while the table is empty, in one statement.
 * `true` when this call inserted it. Defaults to the registered db.
 */
export async function insertFirstUser(row: NewUserTableRow, db?: Db): Promise<boolean> {
    const { db: kysely, table } = createRepository(usersTable, db).kysely();
    // `encodeWith` mints the id and the timestamps the columns default, and
    // serializes every value; the Kysely handle spells the column names the way
    // `CamelCasePlugin` does.
    const cells = Object.entries(encodeWith(usersTable, row));
    const result = await kysely
        .insertInto(table)
        .columns(cells.map(([column]) => column))
        .expression(
            kysely
                .selectNoFrom(cells.map(([column, value]) => sql.val(value).as(column)))
                .where(({ not, exists, selectFrom }) =>
                    not(exists(selectFrom(table).select(sql.lit(1).as('one'))))
                )
        )
        .executeTakeFirst();
    return Number(result.numInsertedOrUpdatedRows ?? 0) === 1;
}
