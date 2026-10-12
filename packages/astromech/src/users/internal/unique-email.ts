import { usersTable } from '@/database/tables';
import { ResourceValidationError } from '@/errors/resource';
import { userRepository } from '../repository';

/** What SQLite says when the unique index on `users.email` refuses a write. */
const EMAIL_VIOLATION = `UNIQUE constraint failed: ${usersTable.name}.email`;

/**
 * Refuses an email a user other than `userId` holds, before the write, with a
 * 422 naming `email`, as a field's uniqueness validator would.
 */
export async function assertEmailFree(email: string, userId?: string): Promise<void> {
    const holder = await userRepository.findIdByEmail(email);
    if (holder !== null && holder !== userId) throw emailTakenError();
}

/**
 * The same 422 for `err` when it is the unique index refusing the email, else
 * `err`: another write can take the email between the check and this one.
 */
export function asEmailTakenError(err: unknown): unknown {
    return isEmailViolation(err) ? emailTakenError() : err;
}

function emailTakenError(): ResourceValidationError {
    return new ResourceValidationError([], {
        email: ['A user with this email already exists'],
    });
}

/**
 * libsql and D1 both carry SQLite's own wording, each wrapped in its own error,
 * so the whole `cause` chain is read.
 */
function isEmailViolation(err: unknown): boolean {
    let current: unknown = err;
    while (current instanceof Error) {
        if (current.message.includes(EMAIL_VIOLATION)) return true;
        current = current.cause;
    }
    return false;
}
