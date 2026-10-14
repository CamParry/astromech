import type { AccessFunction, Caller } from '@/permissions/access';
import { userPermission } from '@/users/permissions';

/**
 * `get`'s rule: `users:read`, except for a caller reading their own account,
 * who needs no permission.
 */
export const userGetAccess: AccessFunction = (input, caller) =>
    isOwnAccount(input, caller) ? null : userPermission('read');

/**
 * `update`'s rule: `users:update`, except for a caller changing the `name` or
 * `fields` of their own account, who needs no permission. A change to their
 * own `role` or `email` still needs it: a stolen session could otherwise change
 * the email and then reset the password.
 */
export const userUpdateAccess: AccessFunction = (input, caller) => {
    const update = userPermission('update');
    if (!isOwnAccount(input, caller)) return update;

    const data = dataOf(input);
    for (const field of ['role', 'email'] as const) {
        if (data[field] !== undefined) {
            return {
                permissions: [update],
                message: `Changing your ${field} requires the "${update}" permission`,
            };
        }
    }
    return null;
};

/** Whether the call's `id` is the signed-in caller's own. */
function isOwnAccount(input: unknown, caller: Caller): boolean {
    if (typeof input !== 'object' || input === null) return false;
    const { id } = input as { id?: unknown };
    return caller.user !== null && typeof id === 'string' && id === caller.user.id;
}

/** The `data` object of a call's input, or an empty one when it holds none. */
function dataOf(input: unknown): Record<string, unknown> {
    const { data } = input as { data?: unknown };
    return typeof data === 'object' && data !== null
        ? (data as Record<string, unknown>)
        : {};
}
