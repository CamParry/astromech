import type { UserRow } from '../tables';
import type { JsonObject, User } from '@/types/index';

/** The stored row as the domain type. Every read path returns through here. */
export function toUser(row: UserRow): User {
    return {
        ...row,
        fields: (row.fields as JsonObject | null) ?? null,
        role: row.role,
    };
}
