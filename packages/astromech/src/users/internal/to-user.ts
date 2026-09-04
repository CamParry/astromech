import type { UserRow } from '../repository';
import type { User } from '@/types/index';

/**
 * The stored row as the domain type. Every read path returns through here.
 * Mapped column by column, not spread: `contentId` and `staged` never leave the
 * repository layer, and `User.updatedAt` is the account row's last change,
 * which the row carries as `accountUpdatedAt`.
 */
export function toUser(row: UserRow): User {
    return {
        id: row.id,
        email: row.email,
        name: row.name,
        emailVerified: row.emailVerified,
        image: row.image,
        locale: row.locale,
        locales: row.locales,
        fields: row.fields,
        role: row.role,
        createdAt: row.createdAt,
        updatedAt: row.accountUpdatedAt,
    };
}
