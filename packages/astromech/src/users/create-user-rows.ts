/**
 * The write a new user goes through, shared by `users.create` and first-run
 * setup, so the first admin gets the same fields, account and index rows.
 */

import type { UserResource } from './repository';
import type { NewUserTableRow } from './tables';
import type { ContentWrite } from '@/content/repository/types';
import type { ResolvedConfig, User } from '@/types/index';
import { hashPassword } from 'better-auth/crypto';
import { getDefaultContentLocale } from '@/config/content-locale';
import { prepareFields } from '@/content/prepare-fields';
import { transaction } from '@/database/transaction';
import { syncUserRelationships } from './relationships';
import { userRepository } from './repository';

/** What `createUserRows` writes, and who writes it. */
export type NewUser = {
    config: ResolvedConfig;
    /** The caller, recorded as the content row's author. */
    user: User | null;
    row: NewUserTableRow;
    /** Writes the credential account the user signs in with. */
    password?: string | undefined;
    /** The default-locale fields, parsed as a create. */
    fields?: Record<string, unknown> | undefined;
};

/**
 * Write a new user: its `users` row, credential account, default-locale content
 * row and relationship index rows, in one transaction. With `ifEmpty`, the
 * `users` row is written only into an empty table, and `null` answers one that was not.
 */
export async function createUserRows(
    input: NewUser & { ifEmpty: true }
): Promise<UserResource | null>;
export async function createUserRows(input: NewUser): Promise<UserResource>;
export async function createUserRows(
    input: NewUser & { ifEmpty?: boolean }
): Promise<UserResource | null> {
    const { config, user, row, password } = input;
    const userId = user?.id ?? null;

    const fields = await prepareFields({
        resource: 'user',
        config,
        operation: 'create',
        user,
        values: input.fields ?? {},
    });
    // Hashed before the transaction, so no lock is held while it runs.
    const passwordHash =
        password === undefined ? undefined : await hashPassword(password);
    const write: ContentWrite = { fields, createdBy: userId, updatedBy: userId };

    return transaction(async () => {
        const created =
            input.ifEmpty === true
                ? await createIfEmpty(row, write)
                : await userRepository.create(row, write);
        if (created === null) return null;
        if (passwordHash !== undefined) {
            await userRepository.createCredentialAccount(created.id, passwordHash);
        }
        await syncUserRelationships(config, created.id);
        return created;
    });
}

/** The `users` row only into an empty table, then its content row; `null` when the table was not empty. */
async function createIfEmpty(
    row: NewUserTableRow,
    write: ContentWrite
): Promise<UserResource | null> {
    // Minted here, not by the column default: the content row is written under it.
    const id = row.id ?? crypto.randomUUID();
    if (!(await userRepository.createIfEmpty({ ...row, id }))) return null;
    // A write to a locale with no content row creates it.
    return userRepository.update({ id, locale: getDefaultContentLocale() }, write);
}
