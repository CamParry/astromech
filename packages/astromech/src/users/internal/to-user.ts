import type { UserResource } from '../repository';
import type { User } from '@/types/index';

/**
 * The resource as the public type. Every read path returns through here. Mapped
 * column by column, not spread: `contentId` and `staged` never leave the
 * repository layer, and `User.updatedAt` is the `users` row's last change.
 */
export function toUser(resource: UserResource): User {
    return {
        id: resource.id,
        email: resource.email,
        name: resource.name,
        emailVerified: resource.emailVerified,
        image: resource.image,
        locale: resource.locale,
        locales: resource.locales,
        fields: resource.fields,
        role: resource.role,
        createdAt: resource.createdAt,
        updatedAt: resource.accountUpdatedAt,
    };
}
