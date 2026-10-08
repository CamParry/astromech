/**
 * The users service contract and its input types: what `app.users` offers.
 * `service.ts` binds the definition that implements it.
 */

import type { createUserSchema, updateUserSchema } from './schema';
import type { User, UserVersion, VersionMetadata } from '@/types/domain';
import type { QueryResult, UserQueryParams } from '@/types/query';
import type { z } from 'zod';

/** The row `users.create` writes. `role` defaults to the least-privileged built-in. */
export type UserCreateData = z.input<typeof createUserSchema>;

/** What one `users.update` call may write. */
export type UserUpdateData = z.input<typeof updateUserSchema>;

/**
 * The users domain's service contract. A missing `locale` is the default content
 * locale; `query` and `get` fall back to it when the one asked for has no
 * content row, while the version methods address a content row and
 * throw `ResourceNotFoundError` when there is none.
 */
export type UsersService = {
    query(params?: UserQueryParams): Promise<QueryResult<User>>;
    get(params: { id: string; locale?: string }): Promise<User | null>;
    create(params: { data: UserCreateData }): Promise<User>;
    update(params: { id: string; locale?: string; data: UserUpdateData }): Promise<User>;
    delete(params: { id: string }): Promise<void>;
    /** This locale's saved versions, newest first, as their metadata. */
    versions(params: { id: string; locale?: string }): Promise<VersionMetadata[]>;
    /** One saved version of this locale, by its number, with its snapshot. */
    getVersion(params: {
        id: string;
        locale?: string;
        version: number;
    }): Promise<UserVersion>;
    restoreVersion(params: {
        id: string;
        locale?: string;
        version: number;
    }): Promise<User>;
};
